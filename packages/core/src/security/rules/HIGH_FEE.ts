import { resolveSources } from "../decode/sources.js";
import type { Rule } from "../types.js";
import { formatStroops } from "./format.js";
import { THRESHOLDS } from "./thresholds.js";

/**
 * HIGH_FEE (SHIELD §6.1, §6.3): the most the fee payer can be charged, the fee bid or for a fee
 * bump its outer max fee, is above the threshold. The evidence carries that maximum.
 */
export const HIGH_FEE: Rule = {
  id: "HIGH_FEE",
  evaluate(ctx) {
    const { maxTotalFeeStroops } = THRESHOLDS.HIGH_FEE;
    const decoded = ctx.decoded;
    const maxFeeStroops = decoded.feeBump?.maxFeeStroops ?? decoded.feeStroops;
    if (maxFeeStroops <= maxTotalFeeStroops) return [];
    const payer = resolveSources(decoded, ctx.userAccount).fee;
    return [
      {
        ruleId: "HIGH_FEE",
        severity: "medium",
        confidence: "high",
        evidence: {
          maxFee: formatStroops(maxFeeStroops),
          maxFeeStroops: maxFeeStroops.toString(),
          threshold: formatStroops(maxTotalFeeStroops),
          feePayer: payer.isUser ? `your account ${payer.address}` : payer.address,
        },
      },
    ];
  },
};
