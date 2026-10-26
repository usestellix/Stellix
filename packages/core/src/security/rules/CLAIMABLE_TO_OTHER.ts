import { extractBaseAddress } from "@stellar/stellar-sdk/base";
import { resolveSources } from "../decode/sources.js";
import type { Finding, Rule } from "../types.js";
import { formatAssetWithIssuer, formatStroops } from "./format.js";

const base = (address: string) => (address.startsWith("M") ? extractBaseAddress(address) : address);

/**
 * CLAIMABLE_TO_OTHER (SHIELD §6.1): a createClaimableBalance whose effective source is the
 * user, where the user isn't among the claimants: once created, only others can take it.
 */
export const CLAIMABLE_TO_OTHER: Rule = {
  id: "CLAIMABLE_TO_OTHER",
  evaluate(ctx) {
    const user = base(ctx.userAccount);
    const sources = resolveSources(ctx.decoded, ctx.userAccount);
    const findings: Finding[] = [];
    ctx.decoded.operations.forEach((op, opIndex) => {
      if (op.kind !== "createClaimableBalance" || sources.ops[opIndex]?.isUser !== true) return;
      if (op.claimants.some((c) => base(c.destination) === user)) return;
      findings.push({
        ruleId: "CLAIMABLE_TO_OTHER",
        severity: "medium",
        confidence: "high",
        opIndex,
        evidence: {
          opNumber: String(opIndex + 1),
          amount: `${formatStroops(op.amountStroops)} ${formatAssetWithIssuer(op.asset)}`,
          claimants: op.claimants.map((c) => c.destination).join(", "),
        },
      });
    });
    return findings;
  },
};
