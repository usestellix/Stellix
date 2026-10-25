import { isUnavailable } from "../lookups.js";
import type { Finding, Rule } from "../types.js";
import { checkedTrustlines } from "./trust.js";

/**
 * TRUST_CLAWBACK (SHIELD §6.1): a new or changed trustline to an asset whose issuer has
 * auth_clawback_enabled, so the issuer can take the asset back from the user's account.
 */
export const TRUST_CLAWBACK: Rule = {
  id: "TRUST_CLAWBACK",
  evaluate(ctx) {
    const findings: Finding[] = [];
    for (const line of checkedTrustlines(ctx.decoded, ctx.userAccount)) {
      const issuer = ctx.data.issuers.get(line.issuer);
      if (issuer === undefined) return { unavailable: true, reason: "internal" };
      if (isUnavailable(issuer)) return issuer;
      if (issuer.clawbackEnabled === null) return { unavailable: true, reason: "bad_response" };
      if (!issuer.clawbackEnabled) continue;
      findings.push({
        ruleId: "TRUST_CLAWBACK",
        severity: "medium",
        confidence: "high",
        opIndex: line.opIndex,
        evidence: { opNumber: String(line.opIndex + 1), assetCode: line.code, issuer: line.issuer },
      });
    }
    return findings;
  },
};
