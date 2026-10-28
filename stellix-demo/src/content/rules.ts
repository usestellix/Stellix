import type { CapabilityId } from "./shield-status";

// What Shield checks, grouped for people rather than by rule ID. Adapted from the rule catalogue
// (extension repo, docs/SHIELD.md §6) and Shield's own finding copy, never invented. Each group
// names the capability that makes it real, and inherits that capability's status.

export interface RuleCategory {
  id: string;
  title: string;
  description: string;
  checks: readonly string[];
  capability: CapabilityId;
}

export const RULE_CATEGORIES: readonly RuleCategory[] = [
  {
    id: "takeover",
    title: "Account takeover",
    description:
      "Changes that hand your account to someone else. Stellix treats these as blocks, not warnings.",
    checks: [
      "A new signer on your account. A signer with enough weight can move your funds without your recovery phrase.",
      "Changes that leave your own key unable to control your account.",
      "Merges that close your account and send its whole XLM balance elsewhere.",
    ],
    capability: "analyze-pasted",
  },
  {
    id: "outflows",
    title: "Funds leaving your account",
    description: "Where your money goes, compared with what you were shown.",
    checks: [
      "Payments to addresses you weren't shown as a recipient.",
      "Operations that run on your account inside someone else's transaction.",
      "Claimable balances that only others can claim.",
    ],
    capability: "analyze-pasted",
  },
  {
    id: "prices",
    title: "Prices",
    description: "Trades that could cost you far more than the market.",
    checks: [
      "Offers priced more than 5% worse than the best price on the order book.",
      "Path payments whose limit allows more than a 5% loss against the best route.",
    ],
    capability: "analyze-pasted",
  },
  {
    id: "assets",
    title: "Assets and issuers",
    description: "Anyone can create an asset with any name. Shield checks who issued it.",
    checks: [
      "Trustlines to assets that the issuer's own website doesn't list.",
      "Issuers that can take an asset back from your account without your approval.",
    ],
    capability: "analyze-pasted",
  },
  {
    id: "reserves",
    title: "Reserves and fees",
    description: "Costs that are easy to miss.",
    checks: [
      "Changes to who pays the reserve for an account entry, with the XLM involved.",
      "Fees above 0.1 XLM.",
      "Transactions that stay valid for more than an hour, so anyone holding them could submit them later.",
    ],
    capability: "analyze-pasted",
  },
  {
    id: "memos",
    title: "Exchange memos",
    description: "Exchanges use the memo to credit your deposit. Without it, funds can be lost.",
    checks: ["Payments to accounts that require a memo, sent without one, are blocked."],
    capability: "memo-required",
  },
  {
    id: "unreadable",
    title: "Anything Shield can't read",
    description: "Shield never shows something it couldn't check as checked.",
    checks: [
      "Operations Shield can't decode are flagged and need a typed confirmation.",
      "Checks that couldn't run are listed as not checked.",
    ],
    capability: "analyze-pasted",
  },
  {
    id: "soroban-calls",
    title: "Soroban contract calls",
    description: "What a smart-contract call would do to your balances, before you sign.",
    checks: [
      "Balance changes from a simulation of the call.",
      "Failed or unavailable simulations, shown as such and never as a pass.",
      "Balances that would drop for assets or amounts you weren't shown.",
    ],
    capability: "simulate-soroban",
  },
  {
    id: "soroban-auth",
    title: "Authorizations and token approvals",
    description: "Permissions a contract asks you to sign, which someone else may use later.",
    checks: [
      "Token approvals that are very large or last a long time.",
      "Authorizations that reach contracts or functions you weren't shown. These are blocked.",
      "Authorizations that stay valid for a long time.",
    ],
    capability: "decode-soroban-auth",
  },
];
