import type { CheckUnavailable, Finding, Rule, RuleContext, RuleUnavailable } from "../types.js";
import { ACCT_MASTER_WEIGHT } from "./ACCT_MASTER_WEIGHT.js";
import { ACCT_MERGE } from "./ACCT_MERGE.js";
import { ACCT_SIGNER_CHANGE } from "./ACCT_SIGNER_CHANGE.js";
import { CLAIMABLE_TO_OTHER } from "./CLAIMABLE_TO_OTHER.js";
import { FOREIGN_SOURCE_OP } from "./FOREIGN_SOURCE_OP.js";
import { MEMO_REQUIRED } from "./MEMO_REQUIRED.js";
import { OFFER_BAD_PRICE } from "./OFFER_BAD_PRICE.js";
import { PATH_LOW_MIN } from "./PATH_LOW_MIN.js";
import { SPONSORSHIP_CHANGE } from "./SPONSORSHIP_CHANGE.js";
import { TRUST_CLAWBACK } from "./TRUST_CLAWBACK.js";
import { TRUST_UNVERIFIED } from "./TRUST_UNVERIFIED.js";
import { UNNAMED_OUTFLOW } from "./UNNAMED_OUTFLOW.js";
import { UNSUPPORTED_OP } from "./UNSUPPORTED_OP.js";

/**
 * Version of the rule set and thresholds. A report from another version is never signable
 * (SHIELD §4), so bump this whenever a rule, its order or a threshold changes.
 */
export const RULE_SET_VERSION = "10";

/** The registry, in evaluation order. Rule issues append here. */
export const RULES: readonly Rule[] = [
  ACCT_SIGNER_CHANGE,
  ACCT_MASTER_WEIGHT,
  ACCT_MERGE,
  FOREIGN_SOURCE_OP,
  UNNAMED_OUTFLOW,
  CLAIMABLE_TO_OTHER,
  SPONSORSHIP_CHANGE,
  OFFER_BAD_PRICE,
  PATH_LOW_MIN,
  TRUST_UNVERIFIED,
  TRUST_CLAWBACK,
  MEMO_REQUIRED,
  UNSUPPORTED_OP,
];

export interface RuleRun {
  findings: Finding[];
  checksUnavailable: CheckUnavailable[];
}

function isUnavailable(result: readonly Finding[] | RuleUnavailable): result is RuleUnavailable {
  return !Array.isArray(result);
}

/**
 * Runs `rules` in order. A rule that can't run, throws, or emits a finding under another rule's
 * ID lands in checksUnavailable: never silently passed (invariant 18), never fatal to the rest.
 */
export function runRules(rules: readonly Rule[], ctx: RuleContext): RuleRun {
  const findings: Finding[] = [];
  const checksUnavailable: CheckUnavailable[] = [];
  for (const rule of rules) {
    let result: readonly Finding[] | RuleUnavailable;
    try {
      result = rule.evaluate(ctx);
    } catch {
      checksUnavailable.push({ ruleId: rule.id, reason: "internal" });
      continue;
    }
    if (isUnavailable(result)) {
      checksUnavailable.push({ ruleId: rule.id, reason: result.reason });
    } else if (result.some((f) => f.ruleId !== rule.id)) {
      checksUnavailable.push({ ruleId: rule.id, reason: "internal" });
    } else {
      findings.push(...result);
    }
  }
  return { findings, checksUnavailable };
}
