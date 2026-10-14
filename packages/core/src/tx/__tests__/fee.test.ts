import { describe, expect, it } from "vitest";
import { feeStatsSchema } from "../../network/horizon-schemas.js";
import { fixture } from "../../network/__tests__/fixtures.js";
import { FALLBACK_FEE_STROOPS, MAX_FEE_STROOPS, fallbackFee, feeFromStats } from "../fee.js";

const stats = (base: string, p70: string) => {
  const s = feeStatsSchema.parse(fixture("fee-stats").body);
  return { ...s, last_ledger_base_fee: base, fee_charged: { ...s.fee_charged, p70 } };
};

describe("fee policy (STELLAR_PRIMER §5.2)", () => {
  it("parses the captured testnet fee_stats", () => {
    expect(
      feeFromStats(feeStatsSchema.parse(fixture("fee-stats").body)).feeStroops,
    ).toBeGreaterThanOrEqual(100n);
  });
  it("takes the higher of base fee and p70", () => {
    expect(feeFromStats(stats("100", "250"))).toEqual({
      feeStroops: 250n,
      estimated: false,
      capped: false,
    });
    expect(feeFromStats(stats("300", "120")).feeStroops).toBe(300n);
  });
  it("floors at 100", () => {
    expect(feeFromStats(stats("50", "10")).feeStroops).toBe(100n);
  });
  it("caps at 100,000 and says so", () => {
    expect(feeFromStats(stats("100", "5000000"))).toEqual({
      feeStroops: MAX_FEE_STROOPS,
      estimated: false,
      capped: true,
    });
  });
  it("falls back to a recent last-known fee, else 1,000 marked estimated", () => {
    expect(fallbackFee({ feeStroops: 400n, at: 1_000 }, 1_000 + 4 * 60_000)).toEqual({
      feeStroops: 400n,
      estimated: false,
      capped: false,
    });
    expect(fallbackFee({ feeStroops: 400n, at: 1_000 }, 1_000 + 5 * 60_000)).toEqual({
      feeStroops: FALLBACK_FEE_STROOPS,
      estimated: true,
      capped: false,
    });
    expect(fallbackFee(null, 0).estimated).toBe(true);
  });
});
