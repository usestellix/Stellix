import { describe, expect, it } from "vitest";
import { PLN, POOL_ID, op, sdkJson } from "./helpers.js";

describe("manageSellOffer", () => {
  it("decodes a new offer (offerId 0) with an exact price", () => {
    expect(op("manageSellOffer-create")).toEqual({
      kind: "manageSellOffer",
      opType: "manageSellOffer",
      source: null,
      selling: PLN,
      buying: { type: "native" },
      amountStroops: 1_000_000_000n,
      price: { n: 1n, d: 1n },
      offerId: 0n,
    });
  });

  it("decodes an update (offerId ≠ 0)", () => {
    expect(op("manageSellOffer-update")).toMatchObject({
      amountStroops: 500_000_000n,
      price: { n: 3n, d: 2n },
      offerId: 931_473n,
    });
  });

  it("decodes a delete (amount 0)", () => {
    expect(op("manageSellOffer-delete")).toMatchObject({
      amountStroops: 0n,
      offerId: 931_473n,
    });
  });
});

describe("manageBuyOffer", () => {
  it("decodes buy amount and price", () => {
    expect(op("manageBuyOffer-create")).toEqual({
      kind: "manageBuyOffer",
      opType: "manageBuyOffer",
      source: null,
      selling: { type: "native" },
      buying: PLN,
      buyAmountStroops: 100_000_000n,
      price: { n: 1n, d: 2n },
      offerId: 0n,
    });
  });
});

describe("createPassiveSellOffer", () => {
  it("decodes the offer", () => {
    expect(op("createPassiveSellOffer")).toEqual({
      kind: "createPassiveSellOffer",
      opType: "createPassiveSellOffer",
      source: null,
      selling: PLN,
      buying: { type: "native" },
      amountStroops: 100_000_000n,
      price: { n: 2n, d: 1n },
    });
  });
});

describe("liquidity pools", () => {
  it("decodes a deposit with its price bounds", () => {
    expect(op("liquidityPoolDeposit")).toEqual({
      kind: "liquidityPoolDeposit",
      opType: "liquidityPoolDeposit",
      source: null,
      liquidityPoolId: POOL_ID,
      maxAmountAStroops: 1_000_000_000n,
      maxAmountBStroops: 1_000_000_000n,
      minPrice: { n: 1n, d: 2n },
      maxPrice: { n: 2n, d: 1n },
    });
    expect(sdkJson("liquidityPoolDeposit")).toMatchObject({
      liquidity_pool_deposit: { liquidity_pool_id: POOL_ID },
    });
  });

  it("decodes a withdrawal", () => {
    expect(op("liquidityPoolWithdraw")).toEqual({
      kind: "liquidityPoolWithdraw",
      opType: "liquidityPoolWithdraw",
      source: null,
      liquidityPoolId: POOL_ID,
      amountStroops: 100_000_000n,
      minAmountAStroops: 10_000_000n,
      minAmountBStroops: 10_000_000n,
    });
  });

  it("keeps prices as bigint rationals, never floats", () => {
    const decoded = op("liquidityPoolDeposit");
    if (decoded.kind !== "liquidityPoolDeposit") throw new Error("expected a deposit");
    expect(typeof decoded.minPrice.n).toBe("bigint");
    expect(typeof decoded.minPrice.d).toBe("bigint");
  });
});
