import { resolveSources } from "../decode/sources.js";
import type { Finding, Rule } from "../types.js";

/**
 * ACCT_SIGNER_CHANGE (SHIELD §6.1): a setOptions whose effective source is the user's account
 * adds a signer or changes a signer's weight. A removal (weight 0) gives no one new power over
 * the account, so it isn't reported. Needs no lookup: the request alone decides it.
 */
export const ACCT_SIGNER_CHANGE: Rule = {
  id: "ACCT_SIGNER_CHANGE",
  evaluate(ctx) {
    const sources = resolveSources(ctx.decoded, ctx.userAccount);
    const findings: Finding[] = [];
    ctx.decoded.operations.forEach((op, opIndex) => {
      const source = sources.ops[opIndex];
      if (op.kind !== "setOptions" || op.signer === null || source?.isUser !== true) return;
      if (op.signer.weight === 0) return;
      findings.push({
        ruleId: "ACCT_SIGNER_CHANGE",
        severity: "critical",
        confidence: "high",
        opIndex,
        evidence: {
          opNumber: String(opIndex + 1),
          account: source.address,
          signerKey: op.signer.key.key,
          weight: String(op.signer.weight),
        },
      });
    });
    return findings;
  },
};
