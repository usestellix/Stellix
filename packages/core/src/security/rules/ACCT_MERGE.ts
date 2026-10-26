import { resolveSources } from "../decode/sources.js";
import type { Finding, Rule } from "../types.js";

/**
 * ACCT_MERGE (SHIELD §6.1): an accountMerge whose effective source is the user's account
 * (muxed included). It closes the account and sends its whole XLM balance to the destination.
 */
export const ACCT_MERGE: Rule = {
  id: "ACCT_MERGE",
  evaluate(ctx) {
    const sources = resolveSources(ctx.decoded, ctx.userAccount);
    const findings: Finding[] = [];
    ctx.decoded.operations.forEach((op, opIndex) => {
      const source = sources.ops[opIndex];
      if (op.kind !== "accountMerge" || source?.isUser !== true) return;
      findings.push({
        ruleId: "ACCT_MERGE",
        severity: "critical",
        confidence: "high",
        opIndex,
        evidence: {
          opNumber: String(opIndex + 1),
          account: source.address,
          destination: op.destination,
        },
      });
    });
    return findings;
  },
};
