import { StrKey } from "@stellar/stellar-sdk/base";
import type { DecodedRequest, Finding, Rule } from "../types.js";

// Shared with the gather step, so it looks up exactly the destinations the rule reads.

/** SEP-29 (stellar-protocol @ af35d0c): the operations whose destination is checked. */
const SEP29_KINDS = new Set([
  "payment",
  "pathPaymentStrictReceive",
  "pathPaymentStrictSend",
  "accountMerge",
]);

export interface CheckedMemoDestination {
  opIndex: number;
  /** G…. */
  destination: string;
}

/**
 * SEP-29: when the transaction has no memo, each payment, path payment and merge to a G…
 * destination, in op order. Muxed (M…) destinations are exempt: the ID identifies the
 * recipient. Every op counts, whoever its source: the memo protects the recipient's credit.
 */
export function checkedMemoDestinations(decoded: DecodedRequest): CheckedMemoDestination[] {
  if (decoded.memo.type !== "none") return [];
  const out: CheckedMemoDestination[] = [];
  decoded.operations.forEach((op, opIndex) => {
    if (!SEP29_KINDS.has(op.kind) || !("destination" in op)) return;
    if (!StrKey.isValidEd25519PublicKey(op.destination)) return;
    out.push({ opIndex, destination: op.destination });
  });
  return out;
}

/**
 * MEMO_REQUIRED (SHIELD §6.1): an op pays an account whose `config.memo_required` data entry
 * is "1", and the transaction has no memo. The SEP-29 check from M3, as a finding.
 */
export const MEMO_REQUIRED: Rule = {
  id: "MEMO_REQUIRED",
  evaluate(ctx) {
    const findings: Finding[] = [];
    for (const { opIndex, destination } of checkedMemoDestinations(ctx.decoded)) {
      const required = ctx.data.memoRequired.get(destination);
      if (required === undefined) return { unavailable: true, reason: "internal" };
      if (typeof required !== "boolean") return required;
      if (!required) continue;
      findings.push({
        ruleId: "MEMO_REQUIRED",
        severity: "high",
        confidence: "high",
        opIndex,
        evidence: { opNumber: String(opIndex + 1), destination },
      });
    }
    return findings;
  },
};
