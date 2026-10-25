import type { Finding, Rule } from "../types.js";

/**
 * UNSUPPORTED_OP (SHIELD §6.1): one high finding per operation the decoder doesn't analyze
 * (Soroban ops, inflation, an op type newer than the decoder), so none is ever shown silently.
 */
export const UNSUPPORTED_OP: Rule = {
  id: "UNSUPPORTED_OP",
  evaluate(ctx) {
    const findings: Finding[] = [];
    ctx.decoded.operations.forEach((op, opIndex) => {
      if (op.kind !== "unsupported") return;
      findings.push({
        ruleId: "UNSUPPORTED_OP",
        severity: "high",
        confidence: "high",
        opIndex,
        evidence: { opNumber: String(opIndex + 1), opType: op.opType },
      });
    });
    return findings;
  },
};
