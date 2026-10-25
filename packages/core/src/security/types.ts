import type { NetworkId } from "../network/config.js";
import type { HorizonClient } from "../network/horizon-client.js";
import type { OrderBook, PathRecord } from "../network/horizon-schemas.js";
import type { DecodedOperation, DecodedSignerKey } from "./decode/operation-types.js";

// Shield's core types (SHIELD.md §4). Everything here is public data: a report may cross
// messaging to the UI, so no field may ever carry secret material.

export type Origin =
  | { type: "stellix" } // Mode A
  | { type: "pasted" } // Mode C
  | { type: "dapp"; url: string }; // Mode B (S2)

export type ShieldRequest =
  | { kind: "transaction"; xdr: string; network: NetworkId; origin: Origin }
  | { kind: "authEntry"; xdr: string; network: NetworkId; origin: Origin } // S3
  | { kind: "message"; message: string; network: NetworkId; origin: Origin }; // S2, SEP-53

/** Fetches an issuer's `stellar.toml` (SHIELD §6.8). The result shape is defined by its issue. */
export interface TomlFetcher {
  fetchToml(homeDomain: string): Promise<unknown>;
}

export interface ShieldDeps {
  horizon: HorizonClient;
  toml: TomlFetcher;
  /** Active G… address. */
  userAccount: string;
  /** Epoch ms. Read once per analysis; rules only see the snapshot (RuleContext.now). */
  now(): number;
  // rpc (S3) and threatLists (S4) are added, optional, in their phases.
}

/** Ordered lowest to highest (SHIELD §6: highest finding wins, never averaged). */
export const SEVERITIES = ["info", "low", "medium", "high", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** The S1 rule IDs (SHIELD §6.1). Closed: a rule, its copy and its fixtures share the ID. */
export const RULE_IDS = [
  "ACCT_SIGNER_CHANGE",
  "ACCT_MASTER_WEIGHT",
  "ACCT_MERGE",
  "FOREIGN_SOURCE_OP",
  "UNNAMED_OUTFLOW",
  "OFFER_BAD_PRICE",
  "PATH_LOW_MIN",
  "CLAIMABLE_TO_OTHER",
  "TRUST_UNVERIFIED",
  "TRUST_CLAWBACK",
  "SPONSORSHIP_CHANGE",
  "NO_MAX_TIME",
  "HIGH_FEE",
  "MEMO_REQUIRED",
  "UNSUPPORTED_OP",
] as const;
export type RuleId = (typeof RULE_IDS)[number];

export interface Finding {
  ruleId: RuleId;
  severity: Severity;
  confidence: "high" | "medium" | "low";
  /** Which operation, if the finding is about one. */
  opIndex?: number;
  /** Public values only, units in key names (e.g. `feeStroops`). Fills the copy placeholders. */
  evidence: Readonly<Record<string, string>>;
}

/** Why a check couldn't run. Shown to the user; never treated as a pass (invariant 18). */
export const UNAVAILABLE_REASONS = [
  "no_source", // the data source isn't configured (e.g. no RPC before S3)
  "unreachable",
  "timeout",
  "bad_response",
  "not_found",
  "internal", // the rule threw, or returned a finding under another rule's ID
] as const;
export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number];

export interface RuleUnavailable {
  unavailable: true;
  reason: UnavailableReason;
}

export interface CheckUnavailable {
  ruleId: RuleId;
  reason: UnavailableReason;
}

/** Bytes that are usually text (memo text, data names). Untrusted: never Stellix's own words. */
export interface DecodedText {
  /** The bytes as UTF-8, or null when they aren't valid UTF-8. */
  text: string | null;
  hex: string;
}

export type DecodedMemo =
  | { type: "none" }
  | ({ type: "text" } & DecodedText)
  | { type: "id"; id: bigint }
  | { type: "hash"; hex: string }
  | { type: "return"; hex: string };

export interface DecodedFeeBump {
  /** G… or M…; pays the fee. */
  feeSource: string;
  /** The outer fee: the most the fee source can be charged for the whole transaction. */
  maxFeeStroops: bigint;
  /** Hash of the inner transaction under the request's network. */
  innerHashHex: string;
}

/**
 * A transaction's preconditions (CAP-21). A transaction without them decodes with every bound
 * null, minSeqAgeSeconds 0, minSeqLedgerGap 0 and no extra signers, which is what the network
 * applies.
 */
export interface DecodedPreconditions {
  /** Epoch seconds. maxTime null: no upper time bound (XDR 0), for NO_MAX_TIME. */
  timeBounds: { minTime: bigint; maxTime: bigint | null } | null;
  /** Valid for ledgers minLedger ≤ n < maxLedger; maxLedger null: no upper bound (XDR 0). */
  ledgerBounds: { minLedger: number; maxLedger: number | null } | null;
  /** Null: valid only when the source's sequence is `sequence − 1`. */
  minSeqNum: bigint | null;
  /** Seconds since the source account's sequence last changed. 0 means no constraint. */
  minSeqAgeSeconds: bigint;
  /** Ledgers since the source account's sequence last changed. 0 means no constraint. */
  minSeqLedgerGap: number;
  /** Signers that must also sign (at most 2). */
  extraSigners: readonly DecodedSignerKey[];
}

/**
 * A transaction envelope (SHIELD §3.1 decode/envelope.ts). For a fee bump, every field except
 * `feeBump` describes the inner transaction: its source is the ops' default source and its
 * fee bid is the inner one (§6.6).
 */
export interface DecodedTransaction {
  kind: "transaction";
  envelopeType: "tx" | "txFeeBump";
  /** G… or M…. */
  source: string;
  /** Fee bid of the (inner) transaction. */
  feeStroops: bigint;
  sequence: bigint;
  memo: DecodedMemo;
  operations: readonly DecodedOperation[];
  /** Upper time bound in seconds; null when absent (no time bounds, or maxTime 0). */
  maxTime: bigint | null;
  /** Of the (inner) transaction; a fee bump has none of its own. */
  preconditions: DecodedPreconditions;
  /** Present exactly when envelopeType is "txFeeBump". */
  feeBump: DecodedFeeBump | null;
}
export type DecodedRequest = DecodedTransaction; // auth entries (S3), messages (S2)

/**
 * Data fetched before the rules run (order books, accounts, stellar.toml), so rules stay pure
 * and never touch the network (SHIELD §6.4). Each rule issue adds the fields it needs.
 */
export interface RuleData {
  /**
   * OFFER_BAD_PRICE: the order book of each offer pair it checks, keyed by `pairKey(selling,
   * buying)`, or why it couldn't be fetched.
   */
  orderBooks: ReadonlyMap<string, OrderBook | RuleUnavailable>;
  /** PATH_LOW_MIN: Horizon's routes for each path payment it checks, keyed by op index. */
  paths: ReadonlyMap<number, readonly PathRecord[] | RuleUnavailable>;
}

export interface RuleContext {
  request: ShieldRequest;
  decoded: DecodedRequest;
  network: NetworkId;
  origin: Origin;
  userAccount: string;
  /** Epoch ms, fixed for the whole analysis. */
  now: number;
  data: RuleData;
}

export interface Rule {
  id: RuleId;
  /** Pure: same context, same result. Findings must carry this rule's ID. */
  evaluate(ctx: RuleContext): readonly Finding[] | RuleUnavailable;
}

export type SimulationStatus =
  { status: "not_applicable" } | { status: "unavailable"; reason: string }; // S3 adds the simulated result

export interface AnalysisReport {
  /** Hex; SHIELD §5. For a transaction, its hash (fee bump: the fee-bump hash). */
  digest: string;
  network: NetworkId;
  /** Who asked: a report for one origin is never accepted for a request from another. */
  origin: Origin;
  ruleSetVersion: string;
  decoded: DecodedRequest;
  simulation: SimulationStatus;
  findings: readonly Finding[];
  checksUnavailable: readonly CheckUnavailable[];
  /** Epoch ms. */
  createdAt: number;
  /** Epoch ms: min(tx maxTime, createdAt + REPORT_TTL_MS). */
  expiresAt: number;
}

export type PolicyDecision =
  | { state: "ready" }
  | { state: "review"; requires: "click" | "typed"; typedPhrase?: string }
  | { state: "blocked"; ruleIds: readonly RuleId[]; overridable: false };
