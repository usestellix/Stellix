import type { RuleId, Severity, UnavailableReason } from "../types.js";

// Text for the findings UI (SHIELD §3.1 ui/components/findings/), next to the rule copy so all
// of Shield's words live in one table. Never "safe" (§1), and an unavailable check is never
// worded as passed (invariant 18).

export const SEVERITY_LABELS = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Info",
} as const satisfies Record<Severity, string>;

/** What each check looks at; names a check that couldn't run, or a finding without copy yet. */
export const CHECK_NAMES = {
  ACCT_SIGNER_CHANGE: "Signer changes on your account",
  ACCT_MASTER_WEIGHT: "Master key weight and thresholds",
  ACCT_MERGE: "Account merge",
  FOREIGN_SOURCE_OP: "Operations from your account in someone else's transaction",
  UNNAMED_OUTFLOW: "Payments to addresses you weren't shown",
  OFFER_BAD_PRICE: "Offer price against the order book",
  PATH_LOW_MIN: "Path payment limit against the best route",
  CLAIMABLE_TO_OTHER: "Claimable balances only others can claim",
  TRUST_UNVERIFIED: "Asset listed by its issuer",
  TRUST_CLAWBACK: "Issuer clawback",
  SPONSORSHIP_CHANGE: "Sponsorship changes",
  NO_MAX_TIME: "Expiry time",
  HIGH_FEE: "Fee size",
  MEMO_REQUIRED: "Required memo",
  UNSUPPORTED_OP: "Operation decoding",
} as const satisfies Record<RuleId, string>;

export const UNAVAILABLE_REASON_TEXT = {
  no_source: "The data this check needs isn't available in this version.",
  unreachable: "The server it needs couldn't be reached.",
  timeout: "The server it needs took too long to answer.",
  bad_response: "The answer it got couldn't be used.",
  not_found: "There was nothing to compare against.",
  internal: "The check failed inside Stellix.",
} as const satisfies Record<UnavailableReason, string>;

export const FINDINGS_UI_TEXT = {
  findingsHeading: "What Shield found",
  /** Only shown when no finding fired; says nothing about checks that didn't run. */
  noFindings: "The checks that ran flagged nothing.",
  operation: "Operation {opNumber}",
  evidenceSummary: "Details",
  /** Evidence values come from the request: shown as data, labelled so. */
  evidenceNote: "Values as they appear in the request.",
  unavailableHeading: "Checks that couldn't run",
  unavailableNote:
    "Shield couldn't complete these checks, so it can't tell you anything about what they look " +
    "for. Treat them as not checked.",
  /** A finding whose rule has no copy yet: its check name is the title. */
  missingCopyBody: "Stellix flagged this, but has no description for it yet. See the details.",
} as const;

/** Labels for evidence keys; a key without one is shown as written. */
export const EVIDENCE_LABELS: Readonly<Record<string, string>> = {
  opNumber: "Operation",
  opType: "Operation type",
  destination: "Destination",
  selling: "Selling",
  buying: "Buying",
  offerPrice: "Offer price",
  bestBidPrice: "Best bid",
  worseByBps: "Worse by (basis points)",
  worsePercent: "Worse by (%)",
  lossAmount: "Possible loss",
  lossAsset: "Loss asset",
  sendAsset: "Sends",
  destAsset: "Delivers",
  limitKind: "Limit",
  limitAmount: "Limit amount",
  limitAsset: "Limit asset",
  bestAmount: "Best route",
  lossBps: "Loss (basis points)",
  lossPercent: "Loss (%)",
  assetCode: "Asset",
  issuer: "Issuer",
  verification: "Verification",
  account: "Account",
  signerKey: "Signer",
  weight: "Weight",
  masterWeightBefore: "Your key's weight before",
  masterWeightAfter: "Your key's weight after",
  highestThresholdAfter: "Highest threshold after",
};
