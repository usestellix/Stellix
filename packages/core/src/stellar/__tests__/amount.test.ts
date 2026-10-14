import { describe, expect, it } from "vitest";
import { INT64_MAX, formatXlm, parseHorizonAmount, parseXlm } from "../amount.js";

describe("parseXlm (STELLAR_PRIMER §3)", () => {
  it.each([
    ["1", 10_000_000n],
    ["1.5", 15_000_000n],
    ["0.0000001", 1n],
    ["0", 0n],
    ["100.0000000", 1_000_000_000n],
    ["007", 70_000_000n],
    ["922337203685.4775807", INT64_MAX],
  ])("accepts %s", (input, stroops) => {
    expect(parseXlm(input)).toBe(stroops);
  });

  it.each([
    ["more than 7 decimals", "0.00000001"],
    ["negative", "-1"],
    ["exponent", "1e7"],
    ["comma", "1,000"],
    ["empty", ""],
    ["lone dot", "."],
    ["leading +", "+1"],
    ["trailing dot", "1."],
    ["leading dot", ".5"],
    ["whitespace", " 1"],
    ["int64 overflow", "922337203685.4775808"],
    ["hex", "0x10"],
  ])("rejects %s", (_name, input) => {
    expect(() => parseXlm(input)).toThrow(expect.objectContaining({ code: "INVALID_AMOUNT" }));
  });

  it("parseHorizonAmount maps bad input to HORIZON_BAD_RESPONSE", () => {
    expect(parseHorizonAmount("9999.9999800")).toBe(99_999_999_800n);
    expect(() => parseHorizonAmount("NaN")).toThrow(
      expect.objectContaining({ code: "HORIZON_BAD_RESPONSE" }),
    );
  });
});

describe("formatXlm", () => {
  it("defaults to exactly 7 decimals (SDK input)", () => {
    expect(formatXlm(15_000_000n)).toBe("1.5000000");
    expect(formatXlm(1n)).toBe("0.0000001");
    expect(formatXlm(0n)).toBe("0.0000000");
  });

  it("trims zeros and groups for display", () => {
    expect(formatXlm(10_000n * 10_000_000n, { trimZeros: true, group: true })).toBe("10,000");
    expect(formatXlm(99_999_999_800n, { trimZeros: true, group: true })).toBe("9,999.99998");
    expect(formatXlm(1_234_567_000_000_000n, { group: true })).toBe("123,456,700.0000000");
  });

  it("handles negatives", () => {
    expect(formatXlm(-15_000_000n, { trimZeros: true })).toBe("-1.5");
  });

  it.each([1n, 15_000_000n, INT64_MAX, 0n])("round-trips %s", (stroops) => {
    expect(parseXlm(formatXlm(stroops))).toBe(stroops);
  });
});
