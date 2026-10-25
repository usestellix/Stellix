import { resolveSources } from "../decode/sources.js";
import type { DecodedRequest } from "../types.js";

// Shared by TRUST_UNVERIFIED, TRUST_CLAWBACK and the gather step, so it fetches exactly the
// issuers the rules read.

export interface CheckedTrustline {
  opIndex: number;
  code: string;
  /** G…. */
  issuer: string;
}

/**
 * changeTrust ops from the user that add or change a trustline to a credit asset, in op order.
 * Removals (limit 0) and pool shares are skipped: neither exposes the user to the issuer anew.
 */
export function checkedTrustlines(
  decoded: DecodedRequest,
  userAccount: string,
): CheckedTrustline[] {
  const sources = resolveSources(decoded, userAccount);
  const out: CheckedTrustline[] = [];
  decoded.operations.forEach((op, opIndex) => {
    if (sources.ops[opIndex]?.isUser !== true) return;
    if (op.kind !== "changeTrust" || op.limitStroops === 0n) return;
    if (op.line.type !== "credit") return;
    out.push({ opIndex, code: op.line.code, issuer: op.line.issuer });
  });
  return out;
}
