import { resolveSources } from "../decode/sources.js";
import type { Finding, Rule } from "../types.js";

/**
 * FOREIGN_SOURCE_OP (SHIELD §6.1): an op whose effective source is the user's account inside a
 * transaction whose source is another account (for a fee bump, the inner transaction's source).
 * Signing it authorizes that op on the user's account in a transaction someone else built.
 */
export const FOREIGN_SOURCE_OP: Rule = {
  id: "FOREIGN_SOURCE_OP",
  evaluate(ctx) {
    const sources = resolveSources(ctx.decoded, ctx.userAccount);
    if (sources.tx.isUser) return [];
    const findings: Finding[] = [];
    ctx.decoded.operations.forEach((op, opIndex) => {
      const source = sources.ops[opIndex];
      if (source?.isUser !== true) return;
      findings.push({
        ruleId: "FOREIGN_SOURCE_OP",
        severity: "high",
        confidence: "high",
        opIndex,
        evidence: {
          opNumber: String(opIndex + 1),
          opType: op.opType,
          account: source.address,
          txSource: sources.tx.address,
        },
      });
    });
    return findings;
  },
};
