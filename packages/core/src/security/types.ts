import type { NetworkId } from "../network/config.js";
import type { HorizonClient } from "../network/horizon-client.js";

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

/**
 * Placeholder until the decoder issues give each operation its own variant (SHIELD §9 S1).
 * `opType` is the XDR OperationType name, e.g. "payment", "revokeSponsorship".
 */
export interface UndecodedOperation {
  kind: "undecoded";
  opType: string;
}
export type DecodedOperation = UndecodedOperation;

export interface DecodedTransaction {
  kind: "transaction";
  envelopeType: "tx" | "txFeeBump";
  /** For a fee bump, the inner transaction's operations. */
  operations: readonly DecodedOperation[];
  /** Upper time bound in seconds; null when absent (no time bounds, or maxTime 0). */
  maxTime: bigint | null;
}
export type DecodedRequest = DecodedTransaction; // auth entries (S3), messages (S2)

/**
 * Data fetched before the rules run (order books, accounts, stellar.toml), so rules stay pure
 * and never touch the network (SHIELD §6.4). Each rule issue adds the fields it needs.
 */
// Empty until the first rule that needs fetched data adds its field.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RuleData {}

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
