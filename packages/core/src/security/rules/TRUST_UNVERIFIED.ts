import { isUnavailable } from "../lookups.js";
import type { Finding, Rule } from "../types.js";
import { checkedTrustlines } from "./trust.js";

/**
 * TRUST_UNVERIFIED (SHIELD §6.1, §6.8): a new or changed trustline to an asset whose issuer has
 * no home_domain, or whose stellar.toml doesn't list the asset under CURRENCIES with the same
 * code and issuer. A toml that can't be fetched or read is RuleUnavailable, never a finding: an
 * unreachable website says nothing about the asset.
 */
export const TRUST_UNVERIFIED: Rule = {
  id: "TRUST_UNVERIFIED",
  evaluate(ctx) {
    const findings: Finding[] = [];
    for (const line of checkedTrustlines(ctx.decoded, ctx.userAccount)) {
      const issuer = ctx.data.issuers.get(line.issuer);
      if (issuer === undefined) return { unavailable: true, reason: "internal" };
      if (isUnavailable(issuer)) return issuer;

      let verification: string;
      if (issuer.homeDomain === null || issuer.toml === null) {
        verification =
          "The issuer account has no home domain, so no website vouches for this asset.";
      } else {
        if (isUnavailable(issuer.toml)) return issuer.toml;
        const listed = issuer.toml.currencies.some(
          (c) => c.code === line.code && c.issuer === line.issuer,
        );
        if (listed) continue;
        // Only reached for a home domain the fetcher accepted: a plain lowercase DNS name.
        verification =
          `The stellar.toml at ${issuer.homeDomain.toLowerCase()} doesn't list ` +
          `${line.code} with this issuer.`;
      }
      findings.push({
        ruleId: "TRUST_UNVERIFIED",
        severity: "medium",
        confidence: "high",
        opIndex: line.opIndex,
        evidence: {
          opNumber: String(line.opIndex + 1),
          assetCode: line.code,
          issuer: line.issuer,
          verification,
        },
      });
    }
    return findings;
  },
};
