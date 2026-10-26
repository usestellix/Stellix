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
  ACCT_SIGNER_CHANGE: {
    title: "New signer on your account",
    body:
      "Operation {opNumber} gives {signerKey} a signing weight of {weight} on your account " +
      "{account}. A signer with enough weight can move your funds and change your account " +
      "without your recovery phrase.",
  },
  ACCT_MASTER_WEIGHT: {
    title: "Your key could lose control of your account",
    body:
      "After operation {opNumber}, your own key on account {account} has a weight of " +
      "{masterWeightAfter} (it was {masterWeightBefore}), and the highest threshold is " +
      "{highestThresholdAfter}. Your key alone could no longer authorize every operation on " +
      "the account. A weight of 0 turns your key off entirely, and you might not be able to " +
      "undo this.",
  },
  ACCT_MERGE: {
    title: "Closes your account",
    body:
      "Operation {opNumber} merges your account {account} into {destination}: your account is " +
      "closed and its whole XLM balance goes to that address. This can't be undone.",
  },
  FOREIGN_SOURCE_OP: {
    title: "Uses your account in someone else's transaction",
    body:
      "This transaction belongs to {txSource}, but operation {opNumber} ({opType}) runs on your " +
      "account {account}. Signing authorizes that operation on your account.",
  },
  UNNAMED_OUTFLOW: {
    title: "Sends to an address you weren't shown",
    body:
      "Operation {opNumber} ({opType}) sends {amount} to {destination}. You weren't shown this " +
      "address as a recipient before being asked to sign. Only continue if you meant to send " +
      "to it.",
  },
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
  TRUST_UNVERIFIED: {
    title: "Asset not verified by its issuer's website",
    body:
      "Operation {opNumber} adds a trustline to {assetCode} issued by {issuer}. " +
      "{verification} Anyone can create an asset with any code, so {assetCode} here may not " +
      "be the asset you expect. Check the issuer address with the asset's official source.",
  },
  TRUST_CLAWBACK: {
    title: "Issuer can take this asset back",
    body:
      "Operation {opNumber} adds a trustline to {assetCode} issued by {issuer}. This issuer " +
      "has clawback enabled: it can remove {assetCode} from your account at any time, without " +
      "your approval.",
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
