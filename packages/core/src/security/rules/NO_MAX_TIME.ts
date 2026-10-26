import { formatDuration, formatEpochSeconds } from "../copy/predicate.js";
import type { Rule } from "../types.js";
import { THRESHOLDS } from "./thresholds.js";

/**
 * NO_MAX_TIME (SHIELD §6.1, §6.3): the transaction has no upper time bound (maxTime absent or
 * 0), or one more than the threshold after `now`. A signed transaction stays submittable until
 * then, by anyone holding it.
 */
export const NO_MAX_TIME: Rule = {
  id: "NO_MAX_TIME",
  evaluate(ctx) {
    const { maxValiditySeconds } = THRESHOLDS.NO_MAX_TIME;
    const nowSeconds = BigInt(Math.floor(ctx.now / 1000));
    const maxTime = ctx.decoded.maxTime;
    if (maxTime !== null && maxTime <= nowSeconds + maxValiditySeconds) return [];
    return [
      {
        ruleId: "NO_MAX_TIME",
        severity: "medium",
        confidence: "high",
        evidence: {
          validUntil: maxTime === null ? "no end time" : formatEpochSeconds(maxTime),
          maxValidity: formatDuration(maxValiditySeconds),
        },
      },
    ];
  },
};
