import type { FeeStats } from "../network/horizon-schemas.js";

// Fee policy (STELLAR_PRIMER §5.2, TRANSACTIONS §3.5). Per operation, bigint stroops.

export const MIN_FEE_STROOPS = 100n;
/** 0.01 XLM. A core constant; there is no user setting in the MVP. */
export const MAX_FEE_STROOPS = 100_000n;
/** Used when fee_stats fails and nothing recent is known (100 × 10). */
export const FALLBACK_FEE_STROOPS = 1_000n;
export const LAST_KNOWN_FEE_MAX_AGE_MS = 5 * 60_000;

export interface FeeChoice {
  feeStroops: bigint;
  /** fee_stats was unavailable and no recent value was known. */
  estimated: boolean;
  /** The cap was binding: tell the user the network is congested. */
  capped: boolean;
}

/** clamp(max(last_ledger_base_fee, fee_charged.p70), floor 100, cap 100,000). */
export function feeFromStats(stats: FeeStats): FeeChoice {
  const base = BigInt(stats.last_ledger_base_fee);
  const p70 = BigInt(stats.fee_charged.p70);
  const wanted = base > p70 ? base : p70;
  if (wanted > MAX_FEE_STROOPS)
    return { feeStroops: MAX_FEE_STROOPS, estimated: false, capped: true };
  return {
    feeStroops: wanted < MIN_FEE_STROOPS ? MIN_FEE_STROOPS : wanted,
    estimated: false,
    capped: false,
  };
}

export function fallbackFee(
  lastKnown: { feeStroops: bigint; at: number } | null,
  now: number,
): FeeChoice {
  if (lastKnown !== null && now - lastKnown.at < LAST_KNOWN_FEE_MAX_AGE_MS) {
    return { feeStroops: lastKnown.feeStroops, estimated: false, capped: false };
  }
  return { feeStroops: FALLBACK_FEE_STROOPS, estimated: true, capped: false };
}
