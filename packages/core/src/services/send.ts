import { MuxedAccount } from "@stellar/stellar-sdk/base";
import { StellixError, isStellixError, type ErrorCode, type ErrorDetails } from "../errors.js";
import { readAccounts } from "../accounts.js";
import { deriveKeypair, mnemonicToSeed } from "../keys/derive.js";
import { getBaseReserveStroops } from "../network/base-reserve.js";
import { NETWORKS, type NetworkId } from "../network/config.js";
import type { HorizonClient } from "../network/horizon-client.js";
import type { AccountRecord, PaymentRecord } from "../network/horizon-schemas.js";
import type { Platform } from "../platform.js";
import { assertSignable } from "../security/assert-signable.js";
import { decodeTransactionEnvelope } from "../security/decode/index.js";
import { analyze } from "../security/index.js";
import { NO_TOML } from "../security/intel/no-toml.js";
import {
  fromStoredReport,
  reportView,
  toStoredReport,
  type ReportView,
  type StoredReport,
} from "../security/report.js";
import type { AnalysisReport, Origin, PolicyDecision, TomlFetcher } from "../security/types.js";
import { readSettings } from "../settings.js";
import { isMultisig, summarizeAccount } from "../stellar/account-summary.js";
import { isMuxedAddress } from "../stellar/address.js";
import { minimumStartingBalanceStroops } from "../stellar/reserve.js";
import {
  INFLIGHT_KEY_PREFIX,
  PERSISTENT_KEYS,
  PREPARED_TX_KEY_PREFIX,
  SW_CACHE_PREFIX,
} from "../storage-keys.js";
import { buildPaymentTransaction, rehydrateTransaction, transactionHashHex } from "../tx/build.js";
import { mapResultCodes, type RebuildReason } from "../tx/errors.js";
import { fallbackFee, feeFromStats, type FeeChoice } from "../tx/fee.js";
import { decodeResultXdr } from "../tx/result-codes.js";
import { resolveTransaction } from "../tx/resolve.js";
import { selectOperation } from "../tx/select-op.js";
import { assertSameSummary, summarizeTransaction, type PaymentSummary } from "../tx/summary.js";
import { validatePayment, type PaymentInput } from "../tx/validate.js";
import { openVaultWithKey } from "../vault/vault.js";
import { requireUnlocked } from "./session.js";

// Send (TRANSACTIONS §3–5, ADR 0003, ADR 0007). Called by the SW handlers (and later mobile's
// secure module). Double-send guards:
// - CONFIRM consumes (deletes) the prepared tx BEFORE signing; the SW serial queue makes that
//   read-and-delete exclusive.
// - PREPARE refuses while the account has an unresolved in-flight tx (TX_IN_FLIGHT).
// - Only the SAME signed XDR is ever resubmitted; a rebuilt tx is a new review.
// Shield Mode A (SHIELD §2, §5): PREPARE analyzes the built tx and stores the report beside it;
// CONFIRM calls assertSignable on the stored tx and stored report before signing. Reports never
// arrive in a message. Resubmitting an already-signed tx is not signing and isn't re-checked.

export type SendPlatform = Pick<Platform, "persistent" | "session" | "now">;

export interface SendDeps {
  horizonFor: (network: NetworkId) => HorizonClient;
  sleep?: (ms: number) => Promise<void>;
  /** Shield's stellar.toml source. Absent: NO_TOML (Mode A builds no changeTrust). */
  toml?: TomlFetcher;
}

const STELLIX: Origin = { type: "stellix" };

const CONFIRM_SAFETY_MS = 10_000;
const RESUBMIT_MIN_INTERVAL_MS = 2_000;
/** Finished outcomes are kept for the popup to show, then purged (DISMISS_OUTCOME or 30 min). */
const OUTCOME_RETENTION_MS = 30 * 60_000;
const FIRST_TIME_LOOKBACK = 200;

export type SubmitOutcome =
  | { status: "success"; hash: string; ledger: number }
  | {
      status: "failed";
      /** Always known: failures are only reported after signing. */
      hash: string;
      error: { code: ErrorCode; message: string; details?: ErrorDetails };
    }
  | { status: "rebuild"; reason: RebuildReason }
  | { status: "pending"; hash: string };

interface PreparedTx {
  xdr: string;
  network: NetworkId;
  summary: PaymentSummary;
  expiresAt: number;
  accountIndex: number;
  /** Shield's report on `xdr`, made by this SW at PREPARE. Absent on one stored before Shield. */
  report?: StoredReport;
}

type InflightStatus = "submitting" | "resolving" | "done";

interface InflightRecord {
  hash: string;
  /** Signed envelope, so the SAME XDR can be resubmitted. Dropped once the outcome is known. */
  signedXdr: string | null;
  network: NetworkId;
  source: string;
  maxTimeSeconds: number;
  summary: PaymentSummary;
  /** Horizon answered PENDING/DUPLICATE at least once. */
  accepted: boolean;
  lastSubmitAt: number;
  status: InflightStatus;
  outcome: Exclude<SubmitOutcome, { status: "pending" }> | null;
  updatedAt: number;
  completedAt: number | null;
}

/** What the popup may see (no XDR). */
export interface InflightView {
  hash: string;
  network: NetworkId;
  summary: PaymentSummary;
  status: "resolving" | "done";
  outcome: Exclude<SubmitOutcome, { status: "pending" }> | null;
}

const preparedKey = (id: string) => `${PREPARED_TX_KEY_PREFIX}${id}`;
const inflightKey = (hash: string) => `${INFLIGHT_KEY_PREFIX}${hash}`;
const feeCacheKey = (network: NetworkId) => `${SW_CACHE_PREFIX}fee:${network}`;

// ---------- PREPARE ----------

export async function preparePayment(
  platform: SendPlatform,
  deps: SendDeps,
  input: PaymentInput,
): Promise<{
  preparedId: string;
  summary: PaymentSummary;
  expiresAt: number;
  report: ReportView;
}> {
  (await requireUnlocked(platform)).fill(0);
  const settings = await readSettings(platform.persistent);
  const network = settings.network;
  const source = await activeAccount(platform);

  if (
    (await readInflight(platform)).some((r) => r.source === source.publicKey && r.status !== "done")
  ) {
    throw new StellixError(
      "TX_IN_FLIGHT",
      "A previous payment from this account is still confirming",
      true,
    );
  }

  const payment = validatePayment(input, source.publicKey);
  const horizon = deps.horizonFor(network);

  const sourceRecord = await horizon.getAccount(source.publicKey);
  if (sourceRecord === null)
    throw new StellixError("SOURCE_UNFUNDED", "Source account doesn't exist");
  if (isMultisig(sourceRecord))
    throw new StellixError("MULTISIG_UNSUPPORTED", "Multisig accounts can't send");

  const destRecord = await horizon.getAccount(payment.destinationBase);
  const kind = selectOperation(payment.muxed, destRecord !== null);
  // SEP-29 is Shield's MEMO_REQUIRED rule, checked on the built tx below (blockedAtPrepare).

  const fee = await chooseFee(platform, horizon, network);
  const reserve = await getBaseReserveStroops(network, horizon, {
    store: platform.session,
    prefix: SW_CACHE_PREFIX,
  });
  const balance = summarizeAccount(sourceRecord, reserve);
  if (!balance.funded) throw new StellixError("SOURCE_UNFUNDED", "Source account doesn't exist");
  const maxSendable =
    balance.availableStroops > fee.feeStroops ? balance.availableStroops - fee.feeStroops : 0n;
  if (payment.amountStroops > maxSendable) {
    throw new StellixError("INSUFFICIENT_BALANCE", "Not enough available XLM", false, {
      maxSendableStroops: maxSendable.toString(),
    });
  }
  if (kind === "createAccount" && payment.amountStroops < minimumStartingBalanceStroops(reserve)) {
    throw new StellixError(
      "BELOW_MIN_STARTING_BALANCE",
      "New accounts need at least 2 × base reserve",
    );
  }

  const firstTimeDestination = await isFirstTime(
    horizon,
    source.publicKey,
    payment.destinationBase,
  );
  const tx = buildPaymentTransaction({
    sourceId: source.publicKey,
    sourceSequence: sourceRecord.sequence,
    kind,
    destination: payment.destination,
    amountStroops: payment.amountStroops,
    memo: payment.memo,
    feeStroops: fee.feeStroops,
    networkPassphrase: NETWORKS[network].passphrase,
  });
  const summary = summarizeTransaction(tx, {
    network,
    expectedSource: source.publicKey,
    firstTimeDestination,
    feeEstimated: fee.estimated,
  });

  const xdr = tx.toXdr();
  // Analysis reads the account records the summary was built from: no second lookup to fail.
  const known = new Map<string, AccountRecord | null>([
    [source.publicKey, sourceRecord],
    [payment.destinationBase, destRecord],
  ]);
  const report = await analyze(
    { kind: "transaction", xdr, network, origin: STELLIX },
    {
      horizon: withKnownAccounts(horizon, known),
      toml: deps.toml ?? NO_TOML,
      userAccount: source.publicKey,
      now: platform.now,
    },
  );
  const view = reportView(report);
  if (view.decision.state === "blocked") throw blockedAtPrepare(report, view.decision);

  const preparedId = randomId();
  const prepared: PreparedTx = {
    xdr,
    network,
    summary,
    expiresAt: summary.expiresAt,
    accountIndex: source.index,
    report: toStoredReport(report),
  };
  await platform.session.set(preparedKey(preparedId), prepared);
  return { preparedId, summary, expiresAt: summary.expiresAt, report: view };
}

/** CANCEL_PAYMENT. No unlock needed: it only discards an unsigned prepared tx. */
export async function cancelPayment(platform: SendPlatform, preparedId: string): Promise<void> {
  await platform.session.remove(preparedKey(preparedId));
}

// ---------- CONFIRM, phase 1: consume, sign, submit (run exclusively) ----------

export async function submitPrepared(
  platform: SendPlatform,
  deps: SendDeps,
  preparedId: string,
): Promise<{ hash: string }> {
  const key = await requireUnlocked(platform);
  try {
    const prepared = await platform.session.get<PreparedTx>(preparedKey(preparedId));
    if (prepared === undefined)
      throw new StellixError("PREPARED_TX_NOT_FOUND", "Prepared transaction not found");
    // Consume BEFORE signing: a second confirm for the same id can never sign again.
    await platform.session.remove(preparedKey(preparedId));

    if (platform.now() >= prepared.expiresAt - CONFIRM_SAFETY_MS) {
      throw new StellixError("PREPARED_TX_EXPIRED", "Prepared transaction expired");
    }
    const settings = await readSettings(platform.persistent);
    if (settings.network !== prepared.network)
      throw new StellixError("NETWORK_MISMATCH", "Network changed since review");

    // CLAUDE.md §6.7: the tx is rehydrated with the CURRENT network's passphrase, and the summary
    // re-check asserts it matches what was reviewed.
    const passphrase = NETWORKS[settings.network].passphrase;
    const tx = rehydrateTransaction(prepared.xdr, passphrase);
    // Shield (invariant 15): the stored tx against the report this SW stored with it. Until the
    // Review screen shows findings (#36), no confirmation is recorded: a review fails closed.
    if (prepared.report === undefined) {
      throw new StellixError("SHIELD_REPORT_EXPIRED", "No analysis for this transaction");
    }
    assertSignable(
      { kind: "transaction", xdr: prepared.xdr, network: settings.network, origin: STELLIX },
      fromStoredReport(
        prepared.report,
        decodeTransactionEnvelope(prepared.xdr, settings.network).decoded,
      ),
      null,
      platform.now(),
    );
    assertSameSummary(
      prepared.summary,
      summarizeTransaction(tx, {
        network: settings.network,
        expectedSource: prepared.summary.source,
        firstTimeDestination: prepared.summary.firstTimeDestination,
        feeEstimated: prepared.summary.feeEstimated,
      }),
    );

    const vault = await platform.persistent.get<unknown>(PERSISTENT_KEYS.vault);
    const { mnemonic } = await openVaultWithKey(vault, key);
    const seed = await mnemonicToSeed(mnemonic);
    try {
      const keypair = deriveKeypair(seed, prepared.accountIndex);
      if (keypair.publicKey() !== tx.source)
        throw new StellixError("SIGNING_FAILED", "Derived key doesn't match the source");
      tx.sign(keypair);
    } finally {
      seed.fill(0);
    }

    const hash = transactionHashHex(tx);
    const now = platform.now();
    const record: InflightRecord = {
      hash,
      signedXdr: tx.toXdr(),
      network: prepared.network,
      source: tx.source,
      maxTimeSeconds: Number(tx.timeBounds?.maxTime ?? "0"),
      summary: prepared.summary,
      accepted: false,
      lastSubmitAt: now,
      status: "submitting",
      outcome: null,
      updatedAt: now,
      completedAt: null,
    };
    // Persist BEFORE submitting so a killed worker can still resolve it (TRANSACTIONS §4.6).
    await writeInflight(platform, record);
    await submitOnce(platform, deps.horizonFor(record.network), record);
    return { hash };
  } finally {
    key.fill(0);
  }
}

// ---------- CONFIRM, phase 2 / resume: resolve by hash ----------

export async function awaitOutcome(
  platform: SendPlatform,
  deps: SendDeps,
  hash: string,
  budgetMs: number,
): Promise<SubmitOutcome> {
  let record = await platform.session.get<InflightRecord>(inflightKey(hash));
  if (record === undefined)
    throw new StellixError("PREPARED_TX_NOT_FOUND", "No such in-flight transaction");
  if (record.outcome !== null) return record.outcome;
  const horizon = deps.horizonFor(record.network);
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  const state = await resolveTransaction({
    horizon,
    hash,
    maxTimeSeconds: record.maxTimeSeconds,
    now: platform.now,
    sleep,
    budgetMs,
    // Each poll writes session storage: keeps the MV3 worker alive and records progress.
    onPoll: async () => {
      record = { ...(record as InflightRecord), updatedAt: platform.now() };
      await writeInflight(platform, record);
    },
    // Resubmit the SAME signed XDR while Horizon hasn't accepted it and it can still land.
    whilePending: async () => {
      const r = record as InflightRecord;
      const now = platform.now();
      if (
        !r.accepted &&
        r.signedXdr !== null &&
        now < r.maxTimeSeconds * 1000 &&
        now - r.lastSubmitAt >= RESUBMIT_MIN_INTERVAL_MS
      ) {
        await submitOnce(platform, horizon, r);
        record = (await platform.session.get<InflightRecord>(inflightKey(hash))) ?? r;
      }
    },
  });

  const latest = (await platform.session.get<InflightRecord>(inflightKey(hash))) ?? record;
  if (latest.outcome !== null) return latest.outcome; // e.g. a resubmit got a definitive ERROR
  switch (state.kind) {
    case "pending":
      return { status: "pending", hash };
    case "success":
      return finish(platform, latest, { status: "success", hash, ledger: state.ledger });
    case "expired":
      return finish(
        platform,
        latest,
        failedOutcome(
          new StellixError("TX_EXPIRED_NOT_INCLUDED", "Not included before it expired"),
          hash,
        ),
      );
    case "failed": {
      const mapped = mapResultCodes(state.codes, latest.summary.kind);
      return finish(
        platform,
        latest,
        mapped.kind === "rebuild"
          ? { status: "rebuild", reason: mapped.reason }
          : failedOutcome(mapped.error, hash),
      );
    }
  }
}

/** Convenience for callers without a serial queue: phase 1 then phase 2. */
export async function confirmPayment(
  platform: SendPlatform,
  deps: SendDeps,
  preparedId: string,
  budgetMs = 20_000,
): Promise<SubmitOutcome> {
  const { hash } = await submitPrepared(platform, deps, preparedId);
  return awaitOutcome(platform, deps, hash, budgetMs);
}

/** SW startup / alarm: keep resolving every unfinished tx; purge old finished outcomes. */
export async function resumeInflight(
  platform: SendPlatform,
  deps: SendDeps,
  budgetMs: number,
): Promise<number> {
  let unfinished = 0;
  for (const r of await readInflight(platform)) {
    if (r.status === "done") {
      if (r.completedAt !== null && platform.now() - r.completedAt > OUTCOME_RETENTION_MS) {
        await platform.session.remove(inflightKey(r.hash));
      }
      continue;
    }
    const outcome = await awaitOutcome(platform, deps, r.hash, budgetMs).catch(() => ({
      status: "pending" as const,
      hash: r.hash,
    }));
    if (outcome.status === "pending") unfinished++;
  }
  return unfinished;
}

export async function listInflight(platform: Pick<Platform, "session">): Promise<InflightView[]> {
  return (await readInflight(platform)).map((r) => ({
    hash: r.hash,
    network: r.network,
    summary: r.summary,
    status: r.status === "done" ? "done" : "resolving",
    outcome: r.outcome,
  }));
}

/** DISMISS_OUTCOME: the popup has shown a finished outcome. Unfinished txs can't be dismissed. */
export async function dismissOutcome(platform: SendPlatform, hash: string): Promise<void> {
  const r = await platform.session.get<InflightRecord>(inflightKey(hash));
  if (r === undefined) return;
  if (r.status !== "done")
    throw new StellixError("INVALID_REQUEST", "Transaction is still confirming");
  await platform.session.remove(inflightKey(hash));
}

// ---------- internals ----------

/**
 * The error PREPARE throws for a blocked payment. MEMO_REQUIRED keeps M3's code and copy; a
 * memo check that couldn't run failed its lookup, which M3 reports as NETWORK_ERROR. Exported
 * for tests.
 */
export function blockedAtPrepare(
  report: AnalysisReport,
  decision: Extract<PolicyDecision, { state: "blocked" }>,
): StellixError {
  if (report.findings.some((f) => f.ruleId === "MEMO_REQUIRED")) {
    return new StellixError("MEMO_REQUIRED", "Destination requires a memo (SEP-29)");
  }
  if (
    decision.ruleIds.length === 1 &&
    decision.ruleIds[0] === "MEMO_REQUIRED" &&
    report.checksUnavailable.some((c) => c.ruleId === "MEMO_REQUIRED")
  ) {
    return new StellixError("NETWORK_ERROR", "Couldn't check whether a memo is required", true);
  }
  return new StellixError(
    "SHIELD_BLOCKED",
    `Shield blocks this payment: ${decision.ruleIds.join(", ")}`,
  );
}

/** `horizon`, answering getAccount for `known` ids from the records already fetched. */
function withKnownAccounts(
  horizon: HorizonClient,
  known: ReadonlyMap<string, AccountRecord | null>,
): HorizonClient {
  return {
    getRoot: () => horizon.getRoot(),
    getLatestLedger: () => horizon.getLatestLedger(),
    getAccount: (id) =>
      known.has(id) ? Promise.resolve(known.get(id) ?? null) : horizon.getAccount(id),
    getFeeStats: () => horizon.getFeeStats(),
    submitTransactionAsync: (envelopeXdr) => horizon.submitTransactionAsync(envelopeXdr),
    getTransaction: (hash) => horizon.getTransaction(hash),
    getPayments: (id, limit) => horizon.getPayments(id, limit),
    getHistoryPage: (id, cursor) => horizon.getHistoryPage(id, cursor),
    getOperationEffects: (operationId) => horizon.getOperationEffects(operationId),
    getOrderBook: (selling, buying) => horizon.getOrderBook(selling, buying),
    getStrictSendPaths: (...args) => horizon.getStrictSendPaths(...args),
    getStrictReceivePaths: (...args) => horizon.getStrictReceivePaths(...args),
  };
}

async function submitOnce(
  platform: SendPlatform,
  horizon: HorizonClient,
  record: InflightRecord,
): Promise<void> {
  if (record.signedXdr === null) return;
  const now = platform.now();
  let next: InflightRecord = { ...record, lastSubmitAt: now, status: "resolving", updatedAt: now };
  try {
    const res = await horizon.submitTransactionAsync(record.signedXdr);
    switch (res.tx_status) {
      case "PENDING":
      case "DUPLICATE":
        next = { ...next, accepted: true };
        break;
      case "TRY_AGAIN_LATER":
        // Not accepted: resolve() will resubmit the same XDR with backoff while maxTime allows.
        break;
      case "ERROR": {
        const mapped = mapResultCodes(
          decodeResultXdr(res.error_result_xdr ?? ""),
          record.summary.kind,
        );
        await finish(
          platform,
          next,
          mapped.kind === "rebuild"
            ? { status: "rebuild", reason: mapped.reason }
            : failedOutcome(mapped.error, record.hash),
        );
        return;
      }
    }
  } catch (err: unknown) {
    // Outcome unknown (transport error, timeout): it may or may not have reached Horizon.
    // Resolve by hash; resubmitting the same XDR is safe.
    if (!(isStellixError(err) && err.code === "NETWORK_ERROR")) throw err;
  }
  await writeInflight(platform, next);
}

async function finish(
  platform: SendPlatform,
  record: InflightRecord,
  outcome: Exclude<SubmitOutcome, { status: "pending" }>,
): Promise<Exclude<SubmitOutcome, { status: "pending" }>> {
  const now = platform.now();
  await writeInflight(platform, {
    ...record,
    signedXdr: null,
    status: "done",
    outcome,
    updatedAt: now,
    completedAt: now,
  });
  return outcome;
}

function failedOutcome(
  error: StellixError,
  hash: string,
): Extract<SubmitOutcome, { status: "failed" }> {
  return {
    status: "failed",
    hash,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  };
}

async function writeInflight(platform: SendPlatform, record: InflightRecord): Promise<void> {
  await platform.session.set(inflightKey(record.hash), record);
}

async function readInflight(platform: Pick<Platform, "session">): Promise<InflightRecord[]> {
  const keys = (await platform.session.keys()).filter((k) => k.startsWith(INFLIGHT_KEY_PREFIX));
  const records: InflightRecord[] = [];
  for (const k of keys) {
    const r = await platform.session.get<InflightRecord>(k);
    if (r !== undefined) records.push(r);
  }
  return records;
}

async function activeAccount(
  platform: SendPlatform,
): Promise<{ index: number; publicKey: string }> {
  const [accounts, active] = await Promise.all([
    readAccounts(platform.persistent),
    platform.persistent.get<unknown>(PERSISTENT_KEYS.activeAccountIndex),
  ]);
  const meta = accounts.find((a) => a.index === active) ?? accounts[0];
  if (meta === undefined) throw new StellixError("INTERNAL_ERROR", "No accounts");
  return { index: meta.index, publicKey: meta.publicKey };
}

async function chooseFee(
  platform: SendPlatform,
  horizon: HorizonClient,
  network: NetworkId,
): Promise<FeeChoice> {
  try {
    const choice = feeFromStats(await horizon.getFeeStats());
    await platform.session.set(feeCacheKey(network), {
      feeStroops: choice.feeStroops.toString(),
      at: platform.now(),
    });
    return choice;
  } catch {
    const cached = await platform.session.get<{ feeStroops: string; at: number }>(
      feeCacheKey(network),
    );
    const lastKnown =
      cached !== undefined && /^\d+$/.test(cached.feeStroops)
        ? { feeStroops: BigInt(cached.feeStroops), at: cached.at }
        : null;
    return fallbackFee(lastKnown, platform.now());
  }
}

/** True unless the destination appears in the source's last 200 payment records (TRANSACTIONS §3). */
async function isFirstTime(
  horizon: HorizonClient,
  source: string,
  destinationBase: string,
): Promise<boolean> {
  let records: PaymentRecord[];
  try {
    records = await horizon.getPayments(source, FIRST_TIME_LOOKBACK);
  } catch {
    return true;
  }
  const base = (address: string | undefined) =>
    address !== undefined && isMuxedAddress(address)
      ? MuxedAccount.fromAddress(address, "0").baseAccount().accountId()
      : address;
  return !records.some((r) =>
    [r.to, r.from, r.account, r.funder, r.into].map(base).includes(destinationBase),
  );
}

function randomId(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
