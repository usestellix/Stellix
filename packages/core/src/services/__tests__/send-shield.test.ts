import {
  Account,
  Keypair,
  MuxedAccount,
  TransactionBuilder,
  xdr as Xdr,
} from "@stellar/stellar-sdk/base";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ErrorCode } from "../../errors.js";
import { NETWORKS } from "../../network/config.js";
import {
  accountSchema,
  type AccountRecord,
  type TransactionRecord,
} from "../../network/horizon-schemas.js";
import { fixture } from "../../network/__tests__/fixtures.js";
import { assertSignable } from "../../security/assert-signable.js";
import type * as AssertSignableModule from "../../security/assert-signable.js";
import { decodeTransactionEnvelope } from "../../security/decode/index.js";
import { evaluate } from "../../security/policy/policy.js";
import { fromStoredReport, type StoredReport } from "../../security/report.js";
import type { AnalysisReport, PolicyDecision } from "../../security/types.js";
import { FakeHorizonClient } from "../../testing/fake-horizon.js";
import { createFakePlatform, type FakePlatform } from "../../testing/fake-platform.js";
import { importWallet } from "../onboarding.js";
import { blockedAtPrepare, confirmPayment, preparePayment, submitPrepared } from "../send.js";
import { ABANDON, ABANDON_G0, FAST_SCRYPT, PASSWORD, codeOf } from "./helpers.js";

// Shield Mode A in the send service (SHIELD §2, §5; #24): PREPARE analyzes the built tx and
// stores the report beside it; CONFIRM runs assertSignable on what's stored before signing.
// assertSignable is wrapped in a passthrough spy so tests can count its calls.

vi.mock("../../security/assert-signable.js", async (importOriginal) => {
  const actual = await importOriginal<typeof AssertSignableModule>();
  return { ...actual, assertSignable: vi.fn(actual.assertSignable) };
});

const template = accountSchema.parse(fixture("account-funded").body);
const success = fixture("transaction-success").body as TransactionRecord;
const passphrase = NETWORKS.testnet.passphrase;

function account(id: string, overrides: Partial<AccountRecord> = {}): AccountRecord {
  return {
    ...template,
    id,
    sequence: "1000",
    signers: [{ key: id, weight: 1, type: "ed25519_public_key" }],
    ...overrides,
  };
}

async function setup() {
  const p: FakePlatform = createFakePlatform(Date.now());
  await importWallet(p, { mnemonic: ABANDON, password: PASSWORD }, { scryptParams: FAST_SCRYPT });
  const h = new FakeHorizonClient();
  h.accounts.set(ABANDON_G0, account(ABANDON_G0));
  h.ledger = {
    sequence: 1,
    base_reserve_in_stroops: 5_000_000,
    base_fee_in_stroops: 100,
    closed_at: "",
  };
  h.feeStats = {
    ...(fixture("fee-stats").body as object),
    last_ledger_base_fee: "100",
    fee_charged: {
      ...(fixture("fee-stats").body as { fee_charged: object }).fee_charged,
      p70: "100",
    },
  } as never;
  const sleep = (ms: number) => {
    p.advance(ms);
    return Promise.resolve();
  };
  return { p, h, deps: { horizonFor: () => h, sleep } };
}

const dest = Keypair.random().publicKey();
const hashOf = (xdr: string) =>
  Buffer.from(TransactionBuilder.fromXdr(xdr, passphrase).hash()).toString("hex");

/** Make a submit "land": PENDING now, and the tx appears in the ledger. */
function landOnSubmit(h: FakeHorizonClient) {
  h.onSubmit = (xdr) => {
    const hash = hashOf(xdr);
    h.submitScript.push({ tx_status: "PENDING", hash });
    h.transactions.set(hash, { ...success, hash, ledger: 777 });
  };
}

interface Stored {
  xdr: string;
  report?: StoredReport;
}

async function stored(p: FakePlatform, preparedId: string): Promise<Stored> {
  return (await p.session.get<Stored>(`preparedTx:${preparedId}`))!;
}

async function patchStored(
  p: FakePlatform,
  preparedId: string,
  patch: (s: Stored) => Stored,
): Promise<void> {
  await p.session.set(`preparedTx:${preparedId}`, patch(await stored(p, preparedId)));
}

/** Confirm fails with `code`, before anything is signed or submitted, and consumes the tx. */
async function expectRefused(
  p: FakePlatform,
  h: FakeHorizonClient,
  deps: Awaited<ReturnType<typeof setup>>["deps"],
  preparedId: string,
  code: ErrorCode,
) {
  expect(await codeOf(submitPrepared(p, deps, preparedId))).toBe(code);
  expect(h.calls.filter((c) => c.method === "submitTransactionAsync")).toEqual([]);
  expect(await codeOf(submitPrepared(p, deps, preparedId))).toBe("PREPARED_TX_NOT_FOUND");
}

beforeEach(() => {
  vi.mocked(assertSignable).mockClear();
});

describe("PREPARE_PAYMENT runs Shield on the built tx", () => {
  it.each([
    ["payment to an existing account", () => dest, true],
    ["createAccount to a new account", () => dest, false],
    [
      "payment to an M… address",
      () => new MuxedAccount(new Account(dest, "0"), "7").accountId(),
      true,
    ],
  ])("%s: ready, no findings, no unavailable checks", async (_label, to, exists) => {
    const { p, h, deps } = await setup();
    if (exists) h.accounts.set(dest, account(dest));
    const { preparedId, report } = await preparePayment(p, deps, {
      destination: to(),
      amount: "2",
    });
    const { xdr } = await stored(p, preparedId);
    expect(report).toMatchObject({
      digest: hashOf(xdr),
      network: "testnet",
      findings: [],
      checksUnavailable: [],
      decision: { state: "ready" },
    });
    expect(report).not.toHaveProperty("decoded");
  });

  it("stores the report beside the tx, made for origin stellix", async () => {
    const { p, h, deps } = await setup();
    h.accounts.set(dest, account(dest));
    const { preparedId, report } = await preparePayment(p, deps, {
      destination: dest,
      amount: "2",
    });
    const s = await stored(p, preparedId);
    expect(s.report).toMatchObject({
      digest: report.digest,
      origin: { type: "stellix" },
      expiresAt: report.expiresAt,
    });
    // Storage can't hold bigints: the decoded request is left out and rebuilt at confirm.
    expect(s.report).not.toHaveProperty("decoded");
  });

  it("analysis reuses the accounts PREPARE fetched: one lookup of the destination", async () => {
    const { p, h, deps } = await setup();
    h.accounts.set(dest, account(dest));
    await preparePayment(p, deps, { destination: dest, amount: "2" });
    expect(h.calls.filter((c) => c.method === "getAccount" && c.arg === dest)).toHaveLength(1);
  });

  it("memo-required destination without a memo is refused, and nothing is stored", async () => {
    const { p, h, deps } = await setup();
    h.accounts.set(dest, account(dest, { data: { "config.memo_required": "MQ==" } }));
    expect(await codeOf(preparePayment(p, deps, { destination: dest, amount: "1" }))).toBe(
      "MEMO_REQUIRED",
    );
    expect((await p.session.keys()).filter((k) => k.startsWith("preparedTx:"))).toEqual([]);
  });
});

describe("CONFIRM_PAYMENT calls assertSignable on the stored tx", () => {
  async function prepared() {
    const s = await setup();
    s.h.accounts.set(dest, account(dest));
    landOnSubmit(s.h);
    const { preparedId } = await preparePayment(s.p, s.deps, { destination: dest, amount: "2" });
    return { ...s, preparedId };
  }

  it("ready report: signs once, with no confirmation recorded until #36", async () => {
    const { p, deps, preparedId } = await prepared();
    expect((await confirmPayment(p, deps, preparedId)).status).toBe("success");
    expect(vi.mocked(assertSignable).mock.calls).toHaveLength(1);
    const [req, , confirmation] = vi.mocked(assertSignable).mock.calls[0]!;
    expect(req).toMatchObject({ network: "testnet", origin: { type: "stellix" } });
    expect(confirmation).toBeNull();
  });

  it("a tampered stored tx (fee) is refused: SHIELD_DIGEST_MISMATCH", async () => {
    const { p, h, deps, preparedId } = await prepared();
    await patchStored(p, preparedId, (s) => ({
      ...s,
      xdr: TransactionBuilder.cloneFrom(TransactionBuilder.fromXdr(s.xdr, passphrase) as never, {
        fee: "200",
      })
        .build()
        .toXdr(),
    }));
    await expectRefused(p, h, deps, preparedId, "SHIELD_DIGEST_MISMATCH");
  });

  it("a tampered stored tx (sequence) is refused: SHIELD_DIGEST_MISMATCH", async () => {
    const { p, h, deps, preparedId } = await prepared();
    await patchStored(p, preparedId, (s) => {
      const env = Xdr.TransactionEnvelope.fromXdr(s.xdr, "base64");
      if (env.type !== "envelopeTypeTx") throw new Error("expected a v1 envelope");
      const t = env.v1.tx;
      const tx = new Xdr.Transaction({
        sourceAccount: t.sourceAccount,
        fee: t.fee,
        seqNum: t.seqNum + 1n,
        cond: t.cond,
        memo: t.memo,
        operations: t.operations,
        ext: t.ext,
      });
      const tampered = Xdr.TransactionEnvelope.envelopeTypeTx(
        new Xdr.TransactionV1Envelope({ tx, signatures: [] }),
      );
      return { ...s, xdr: tampered.toXdr("base64") };
    });
    await expectRefused(p, h, deps, preparedId, "SHIELD_DIGEST_MISMATCH");
  });

  it("an expired report is refused: SHIELD_REPORT_EXPIRED", async () => {
    const { p, h, deps, preparedId } = await prepared();
    await patchStored(p, preparedId, (s) => ({
      ...s,
      report: { ...s.report!, expiresAt: p.now() },
    }));
    await expectRefused(p, h, deps, preparedId, "SHIELD_REPORT_EXPIRED");
  });

  it("a report from another rule-set version is refused: SHIELD_REPORT_EXPIRED", async () => {
    const { p, h, deps, preparedId } = await prepared();
    await patchStored(p, preparedId, (s) => ({
      ...s,
      report: { ...s.report!, ruleSetVersion: "0" },
    }));
    await expectRefused(p, h, deps, preparedId, "SHIELD_REPORT_EXPIRED");
  });

  it("a prepared tx stored without a report is refused: SHIELD_REPORT_EXPIRED", async () => {
    const { p, h, deps, preparedId } = await prepared();
    await patchStored(p, preparedId, (s) => {
      const copy = { ...s };
      delete copy.report;
      return copy;
    });
    await expectRefused(p, h, deps, preparedId, "SHIELD_REPORT_EXPIRED");
  });

  it("a MEMO_REQUIRED finding blocks at confirm: SHIELD_BLOCKED", async () => {
    const { p, h, deps, preparedId } = await prepared();
    await patchStored(p, preparedId, (s) => ({
      ...s,
      report: {
        ...s.report!,
        findings: [
          {
            ruleId: "MEMO_REQUIRED",
            severity: "high",
            confidence: "high",
            opIndex: 0,
            evidence: { opNumber: "1", destination: dest },
          },
        ],
      },
    }));
    await expectRefused(p, h, deps, preparedId, "SHIELD_BLOCKED");
  });

  it("a review decision fails closed until #36: SHIELD_CONFIRMATION_REQUIRED", async () => {
    const { p, h, deps, preparedId } = await prepared();
    await patchStored(p, preparedId, (s) => ({
      ...s,
      report: { ...s.report!, checksUnavailable: [{ ruleId: "HIGH_FEE", reason: "internal" }] },
    }));
    await expectRefused(p, h, deps, preparedId, "SHIELD_CONFIRMATION_REQUIRED");
  });

  it("resubmitting the signed tx (ADR 0007) doesn't re-check or re-sign", async () => {
    const { p, h, deps } = await setup();
    h.accounts.set(dest, account(dest));
    const xdrs: string[] = [];
    let first = true;
    h.onSubmit = (xdr) => {
      xdrs.push(xdr);
      const hash = hashOf(xdr);
      if (first) {
        first = false;
        h.submitScript.push({ tx_status: "TRY_AGAIN_LATER", hash });
      } else {
        h.submitScript.push({ tx_status: "PENDING", hash });
        h.transactions.set(hash, { ...success, hash });
      }
    };
    const { preparedId } = await preparePayment(p, deps, { destination: dest, amount: "2" });
    expect((await confirmPayment(p, deps, preparedId)).status).toBe("success");
    expect(xdrs.length).toBeGreaterThanOrEqual(2);
    expect(new Set(xdrs).size).toBe(1);
    expect(TransactionBuilder.fromXdr(xdrs[0]!, passphrase).signatures).toHaveLength(1);
    expect(vi.mocked(assertSignable).mock.calls).toHaveLength(1);
  });
});

describe("blockedAtPrepare: which error a blocked payment shows", () => {
  async function report(): Promise<AnalysisReport> {
    const { p, h, deps } = await setup();
    h.accounts.set(dest, account(dest));
    const { preparedId } = await preparePayment(p, deps, { destination: dest, amount: "2" });
    const s = await stored(p, preparedId);
    return fromStoredReport(s.report!, decodeTransactionEnvelope(s.xdr, "testnet").decoded);
  }

  function blocked(r: AnalysisReport): Extract<PolicyDecision, { state: "blocked" }> {
    const decision = evaluate(r, { origin: "stellix" });
    if (decision.state !== "blocked") throw new Error(`expected blocked, got ${decision.state}`);
    return decision;
  }

  const memoFinding = {
    ruleId: "MEMO_REQUIRED" as const,
    severity: "high" as const,
    confidence: "high" as const,
    opIndex: 0,
    evidence: { opNumber: "1", destination: dest },
  };

  it("a MEMO_REQUIRED finding → MEMO_REQUIRED (M3's code and copy)", async () => {
    const r = { ...(await report()), findings: [memoFinding] };
    expect(blockedAtPrepare(r, blocked(r)).code).toBe("MEMO_REQUIRED");
  });

  it("a memo check that couldn't run → NETWORK_ERROR, retryable (still blocked)", async () => {
    const base = await report();
    const r = {
      ...base,
      checksUnavailable: [{ ruleId: "MEMO_REQUIRED" as const, reason: "unreachable" as const }],
    };
    const error = blockedAtPrepare(r, blocked(r));
    expect([error.code, error.retryable]).toEqual(["NETWORK_ERROR", true]);
  });

  it("any other block → SHIELD_BLOCKED, also alongside an unavailable memo check", async () => {
    const base = await report();
    const merge = {
      ruleId: "ACCT_SIGNER_CHANGE" as const,
      severity: "critical" as const,
      confidence: "high" as const,
      evidence: {},
    };
    const other = { ...base, findings: [merge] };
    expect(blockedAtPrepare(other, blocked(other)).code).toBe("SHIELD_BLOCKED");
    const both = {
      ...other,
      checksUnavailable: [{ ruleId: "MEMO_REQUIRED" as const, reason: "unreachable" as const }],
    };
    expect(blockedAtPrepare(both, blocked(both)).code).toBe("SHIELD_BLOCKED");
  });
});
