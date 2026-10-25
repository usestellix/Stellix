import type { CheckUnavailable, Finding, Rule, RuleContext, RuleUnavailable } from "../types.js";
import { OFFER_BAD_PRICE } from "./OFFER_BAD_PRICE.js";
import { UNSUPPORTED_OP } from "./UNSUPPORTED_OP.js";

/**
 * Version of the rule set and thresholds. A report from another version is never signable
 * (SHIELD §4), so bump this whenever a rule, its order or a threshold changes.
 */
export const RULE_SET_VERSION = "3";

/** The registry, in evaluation order. Rule issues append here. */
export const RULES: readonly Rule[] = [OFFER_BAD_PRICE, UNSUPPORTED_OP];

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
