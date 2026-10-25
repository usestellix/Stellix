import { assertNever } from "../../assert-never.js";
import type { AnalysisReport, Origin, PolicyDecision, RuleId, Severity } from "../types.js";

// The policy engine (SHIELD §6.1 Policy column, §6.5). It turns a report into a decision; it
// never signs. assertSignable re-runs it rather than trusting a decision handed to it.
//
// Outcomes are ordered and combined by taking the strictest, never averaged (invariant 20):
// ready < click < typed < block. "block" is never overridable (invariant 19): no input that
// contains a blocking finding can produce anything but `blocked`.

export type PolicyOutcome = "ready" | "click" | "typed" | "block";
const OUTCOME_ORDER: readonly PolicyOutcome[] = ["ready", "click", "typed", "block"];

export interface Policy {
  origin: Origin["type"];
}

/** What the user types to pass a typed review. */
export const TYPED_CONFIRMATION_PHRASE = "CONFIRM";

/**
 * Per-rule outcome for Mode A (stellix) and Mode B (dapp). Mode C (pasted) is evaluated as
 * Mode B: its report says what Stellix would do if a site asked it to sign the request.
 */
export const RULE_POLICY: Readonly<
  Record<RuleId, { stellix: PolicyOutcome; dapp: PolicyOutcome }>
> = {
  // Stellix never builds these; if one ever appears in Mode A, it's blocked too.
  ACCT_SIGNER_CHANGE: { stellix: "block", dapp: "block" },
  ACCT_MASTER_WEIGHT: { stellix: "block", dapp: "block" },
  // "Blocked unless Origin is stellix"; from Stellix's own flow it still needs typing.
  ACCT_MERGE: { stellix: "typed", dapp: "block" },
  FOREIGN_SOURCE_OP: { stellix: "typed", dapp: "typed" },
  UNNAMED_OUTFLOW: { stellix: "typed", dapp: "typed" },
  OFFER_BAD_PRICE: { stellix: "click", dapp: "click" },
  PATH_LOW_MIN: { stellix: "click", dapp: "click" },
  CLAIMABLE_TO_OTHER: { stellix: "click", dapp: "click" },
  TRUST_UNVERIFIED: { stellix: "click", dapp: "click" },
  TRUST_CLAWBACK: { stellix: "click", dapp: "click" },
  SPONSORSHIP_CHANGE: { stellix: "click", dapp: "click" },
  NO_MAX_TIME: { stellix: "click", dapp: "click" },
  HIGH_FEE: { stellix: "click", dapp: "click" },
  MEMO_REQUIRED: { stellix: "block", dapp: "block" },
  UNSUPPORTED_OP: { stellix: "typed", dapp: "typed" },
};

/** Minimum outcome by severity, whatever the rule's own policy says. */
export const SEVERITY_FLOOR: Readonly<Record<Severity, PolicyOutcome>> = {
  info: "ready",
  low: "ready",
  medium: "click",
  high: "click",
  critical: "typed",
};

function stricter(a: PolicyOutcome, b: PolicyOutcome): PolicyOutcome {
  return OUTCOME_ORDER.indexOf(a) >= OUTCOME_ORDER.indexOf(b) ? a : b;
}

export function ruleOutcome(ruleId: RuleId, origin: Origin["type"]): PolicyOutcome {
  const row = RULE_POLICY[ruleId];
  switch (origin) {
    case "stellix":
      return row.stellix;
    case "dapp":
    case "pasted":
      return row.dapp;
    default:
      return assertNever(origin);
  }
}

export function evaluate(report: AnalysisReport, policy: Policy): PolicyDecision {
  const outcomes: [RuleId, PolicyOutcome][] = [
    ...report.findings.map((f): [RuleId, PolicyOutcome] => [
      f.ruleId,
      stricter(ruleOutcome(f.ruleId, policy.origin), SEVERITY_FLOOR[f.severity]),
    ]),
    // A check that couldn't run counts as if it had fired, and at least needs a click
    // (invariant 18). Failing closed: a blocking rule can't be bypassed by making it fail.
    ...report.checksUnavailable.map((c): [RuleId, PolicyOutcome] => [
      c.ruleId,
      stricter(ruleOutcome(c.ruleId, policy.origin), "click"),
    ]),
  ];
  const outcome = outcomes.reduce<PolicyOutcome>((acc, [, o]) => stricter(acc, o), "ready");
  const blocking = [...new Set(outcomes.filter(([, o]) => o === "block").map(([id]) => id))];
  switch (outcome) {
    case "ready":
      return { state: "ready" };
    case "click":
      return { state: "review", requires: "click" };
    case "typed":
      return { state: "review", requires: "typed", typedPhrase: TYPED_CONFIRMATION_PHRASE };
    case "block":
      return { state: "blocked", ruleIds: blocking, overridable: false };
    default:
      return assertNever(outcome);
  }
}
