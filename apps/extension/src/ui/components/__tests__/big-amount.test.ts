import { describe, expect, it } from "vitest";
import { displayXlm } from "../../lib/xlm.js";
import { bigAmountSize } from "../big-amount.js";

describe("bigAmountSize", () => {
  it.each([
    [10_000n * 10_000_000n, "text-[28px]"], // 10,000
    [12_345_678_901_234n, "text-[22px]"], // 1,234,567.8901234
    [2n ** 63n - 1n, "text-[18px]"], // int64 max: 922,337,203,685.4775807
  ])("%s stroops → %s", (stroops, size) => {
    expect(bigAmountSize(displayXlm(stroops))).toBe(size);
  });

  it("counts the sign of signed detail amounts", () => {
    expect(bigAmountSize(`+${displayXlm(2n ** 63n - 1n)}`)).toBe("text-[18px]");
  });
});
