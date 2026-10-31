import { readActiveAccount } from "../accounts.js";
import { StellixError } from "../errors.js";
import type { NetworkId } from "../network/config.js";
import type { HorizonClient } from "../network/horizon-client.js";
import type { Platform } from "../platform.js";
import { operationSentences, type OperationSentence } from "../security/copy/operations.js";
import { resolveSources } from "../security/decode/sources.js";
import { analyze } from "../security/index.js";
import { parseAnalyzeInput } from "../security/input.js";
import { spendsFromAccount } from "../security/involvement.js";
import { reportView, type ReportView } from "../security/report.js";
import type { DecodedMemo, TomlFetcher } from "../security/types.js";
import { checkAutoLock, isUnlocked } from "./session.js";

// Mode C, analyze-only (SHIELD §2, §8 SHIELD_ANALYZE; #35). Decodes and analyzes a pasted
// transaction for the active account and returns public data. Never signs, and creates nothing
// that can be signed: it reads neither the vault nor the session key (only whether one exists),
// stores no prepared transaction, and its report is never stored. assertSignable refuses origin
// "pasted" as well.

export type AnalyzePlatform = Pick<Platform, "persistent" | "session" | "now">;

export interface AnalyzeDeps {
  horizonFor: (network: NetworkId) => HorizonClient;
  /** Issuers' stellar.toml (SHIELD §6.8): Mode C is the first flow that needs it. */
  toml: TomlFetcher;
  /** Networks this build offers (ADR 0008); the rest are refused. */
  enabledNetworks: readonly NetworkId[];
}

/** Request text (memo text) is data, shown quoted, never as Stellix's words (invariant 17). */
export type MemoView =
  | { type: "none" }
  | { type: "text"; text: string | null; hex: string }
  | { type: "id"; value: string }
  | { type: "hash" | "return"; hex: string };

export interface TransactionView {
  envelopeType: "tx" | "txFeeBump";
  source: string;
  /** Fee bid of the (inner) transaction, decimal stroops. */
  feeStroops: string;
  feeBump: { feeSource: string; maxFeeStroops: string } | null;
  memo: MemoView;
  /** One entry per operation, in order: its plain-language sentences (#41). */
  operations: readonly (readonly OperationSentence[])[];
}

export interface AnalyzeResult {
  /** The account the rules ran for: Mode C's perspective. */
  account: string;
  /** False: nothing in the request acts as the account, so its findings say little. */
  spendsFromAccount: boolean;
  transaction: TransactionView;
  /** decision is display-only: what Stellix would do if a site asked it to sign this. */
  report: ReportView;
}

function memoView(memo: DecodedMemo): MemoView {
  switch (memo.type) {
    case "none":
      return { type: "none" };
    case "text":
      return { type: "text", text: memo.text, hex: memo.hex };
    case "id":
      return { type: "id", value: memo.id.toString() };
    case "hash":
    case "return":
      return { type: memo.type, hex: memo.hex };
  }
}

export async function analyzePasted(
  platform: AnalyzePlatform,
  deps: AnalyzeDeps,
  input: { input: string; network: NetworkId },
): Promise<AnalyzeResult> {
  await checkAutoLock(platform);
  if (!(await isUnlocked(platform))) throw new StellixError("LOCKED", "Wallet is locked");
  if (!deps.enabledNetworks.includes(input.network)) {
    throw new StellixError("INVALID_REQUEST", `Network ${input.network} is not available`);
  }
  const parsed = parseAnalyzeInput(input.input);
  if (parsed.network !== null && parsed.network !== input.network) {
    throw new StellixError("SHIELD_INPUT_INVALID", "Link is for another network", false, {
      linkNetwork: parsed.network,
    });
  }
  const account = (await readActiveAccount(platform.persistent)).publicKey;
  const report = await analyze(
    {
      kind: "transaction",
      xdr: parsed.xdr,
      network: input.network,
      origin: { type: "pasted" },
      presented: { destinations: [] },
    },
    {
      horizon: deps.horizonFor(input.network),
      toml: deps.toml,
      userAccount: account,
      now: () => platform.now(),
    },
  );
  const { decoded } = report;
  const sources = resolveSources(decoded, account);
  return {
    account,
    spendsFromAccount: spendsFromAccount(decoded, account),
    transaction: {
      envelopeType: decoded.envelopeType,
      source: decoded.source,
      feeStroops: decoded.feeStroops.toString(),
      feeBump:
        decoded.feeBump === null
          ? null
          : {
              feeSource: decoded.feeBump.feeSource,
              maxFeeStroops: decoded.feeBump.maxFeeStroops.toString(),
            },
      memo: memoView(decoded.memo),
      operations: decoded.operations.map((op, i) => {
        const source = sources.ops[i];
        if (source === undefined) throw new StellixError("INTERNAL_ERROR", "Missing op source");
        return operationSentences(op, source);
      }),
    },
    report: reportView(report),
  };
}
