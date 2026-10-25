// Rule thresholds (SHIELD §6.3, §12). Rules read them from here; no rule hardcodes a value.
// Changing any value changes analysis results, so bump RULE_SET_VERSION (rules/index.ts) too.
// Ratios are integer basis points (1 bps = 0.01%), money is bigint stroops, time is seconds.
//
// Approved by the maintainer on 2026-10-25 (#11).

export const THRESHOLDS = {
  /** An offer priced worse than the best opposing order-book price by more than this. */
  OFFER_BAD_PRICE: { maxWorseThanBestBps: 500 },
  /** A path payment whose destMin / sendMax allows a loss beyond this vs Horizon's best path. */
  PATH_LOW_MIN: { maxLossVsBestPathBps: 500 },
  /** maxTime absent (0), or later than now + this. */
  NO_MAX_TIME: { maxValiditySeconds: 3_600n },
  /** Total maximum fee (fee bid, or the fee-bump outer fee) above this. 10× MAX_FEE_STROOPS. */
  HIGH_FEE: { maxTotalFeeStroops: 1_000_000n },
} as const;
