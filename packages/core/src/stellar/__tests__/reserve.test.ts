import { describe, expect, it } from "vitest";
import {
  availableStroops,
  minimumBalanceStroops,
  minimumStartingBalanceStroops,
} from "../reserve.js";

const BASE = 5_000_000n; // 0.5 XLM

describe("minimum balance (STELLAR_PRIMER §4)", () => {
  it.each([
    ["plain account", { subentryCount: 0, numSponsoring: 0, numSponsored: 0 }, 10_000_000n],
    ["with subentries", { subentryCount: 3, numSponsoring: 0, numSponsored: 0 }, 25_000_000n],
    ["sponsoring others", { subentryCount: 0, numSponsoring: 2, numSponsored: 0 }, 20_000_000n],
    ["sponsored entries", { subentryCount: 2, numSponsoring: 0, numSponsored: 2 }, 10_000_000n],
    ["all three", { subentryCount: 4, numSponsoring: 1, numSponsored: 2 }, 25_000_000n],
  ])("%s", (_name, inputs, expected) => {
    expect(minimumBalanceStroops(inputs, BASE)).toBe(expected);
  });

  it("follows the base reserve", () => {
    expect(
      minimumBalanceStroops({ subentryCount: 0, numSponsoring: 0, numSponsored: 0 }, 1_000_000n),
    ).toBe(2_000_000n);
  });
});

describe("available balance", () => {
  it("subtracts the minimum balance and selling liabilities", () => {
    expect(availableStroops(100_000_000n, 10_000_000n, 5_000_000n)).toBe(85_000_000n);
  });

  it("never goes below zero", () => {
    expect(availableStroops(10_000_000n, 10_000_000n, 0n)).toBe(0n);
    expect(availableStroops(9_000_000n, 10_000_000n, 1n)).toBe(0n);
  });

  it("minimum starting balance is 2 × base reserve", () => {
    expect(minimumStartingBalanceStroops(BASE)).toBe(10_000_000n);
  });
});
