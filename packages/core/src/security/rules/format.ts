import { STROOPS_PER_XLM, formatXlm } from "../../stellar/amount.js";

// Number formatting for finding evidence. Exact bigint arithmetic, truncated (never rounded up),
// trailing zeros dropped. Evidence is display text; rules compare the exact values.

/** An amount of any asset in stroops (10⁻⁷ units), e.g. "12.5". */
export function formatStroops(stroops: bigint): string {
  return formatXlm(stroops, { trimZeros: true });
}

/** n/d as a decimal with at most `decimals` (≤ 7) fraction digits, truncated. d > 0. */
export function formatRatio(n: bigint, d: bigint, decimals = 7): string {
  const unit = 10n ** BigInt(decimals);
  const scaled = (n * unit) / d;
  return formatStroops(scaled * (STROOPS_PER_XLM / unit));
}
