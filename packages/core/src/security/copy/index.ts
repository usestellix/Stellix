import { StellixError } from "../../errors.js";
import type { Finding, RuleId } from "../types.js";

// Plain-language text for findings, keyed by rule ID (SHIELD §6.4). `{name}` placeholders are
// filled from the finding's evidence. Rules: never say "safe" (§1); evidence values may come
// from the request, so copy quotes them as data and never lets them speak for Stellix
// (invariant 17).

export interface RuleCopy {
  title: string;
  body: string;
}

/** Each rule issue adds its entry here together with the rule. */
export const RULE_COPY: Readonly<Partial<Record<RuleId, RuleCopy>>> = {
  MEMO_REQUIRED: {
    title: "Memo required",
    body:
      "{destination} requires a memo, and this transaction has none. Exchanges and other " +
      "services use the memo to credit a payment. Without it, the funds may be lost.",
  },
  OFFER_BAD_PRICE: {
    title: "Offer below the market price",
    body:
      "Operation {opNumber} offers {selling} at {offerPrice} {buying} per {selling}. The best " +
      "bid on the order book is {bestBidPrice} {buying} per {selling}, so this price is " +
      "{worsePercent}% worse. If the offer is filled at its own price, you could get up to " +
      "{lossAmount} {lossAsset} less than at the best bid.",
  },
  PATH_LOW_MIN: {
    title: "Path payment with a loose limit",
    body:
      "Operation {opNumber} converts {sendAsset} to {destAsset}. Its {limitKind} is " +
      "{limitAmount} {limitAsset}, but the best route Horizon found is {bestAmount} " +
      "{limitAsset}. If the price moves before it runs, you could lose up to {lossAmount} " +
      "{limitAsset} ({lossPercent}%) compared with that route.",
  },
  UNSUPPORTED_OP: {
    title: "Operation Stellix can't read",
    body:
      "Stellix can't decode operation {opNumber} ({opType}) yet, so it hasn't checked what it " +
      "does. Only continue if you know what this operation does and trust where this " +
      "transaction came from.",
  },
};

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g;

/** The placeholder names a template uses, in order of first appearance. */
export function placeholders(template: string): string[] {
  return [...new Set(Array.from(template.matchAll(PLACEHOLDER), (m) => m[1] ?? ""))];
}

/**
 * Fills `{name}` from `evidence` in one pass, so a value containing braces is never expanded.
 * A missing value throws instead of leaving a blank (tests run every rule's findings through
 * this, so a missing placeholder fails them).
 */
export function fillTemplate(template: string, evidence: Readonly<Record<string, string>>) {
  return template.replace(PLACEHOLDER, (_match, name: string) => {
    const value = evidence[name];
    if (value === undefined) {
      throw new StellixError("INTERNAL_ERROR", `Copy placeholder {${name}} has no evidence`);
    }
    return value;
  });
}

export function findingCopy(finding: Finding): RuleCopy {
  const copy = RULE_COPY[finding.ruleId];
  if (copy === undefined) {
    throw new StellixError("INTERNAL_ERROR", `No copy for rule ${finding.ruleId}`);
  }
  return {
    title: fillTemplate(copy.title, finding.evidence),
    body: fillTemplate(copy.body, finding.evidence),
  };
}
