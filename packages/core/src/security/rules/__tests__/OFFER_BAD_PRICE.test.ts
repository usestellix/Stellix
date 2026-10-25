import { describe, expect, it } from "vitest";
import { StellixError } from "../../../errors.js";
import { orderBookSchema } from "../../../network/horizon-schemas.js";
import { FakeHorizonClient } from "../../../testing/fake-horizon.js";
import {
  fixture,
  lookup,
  marketFixture,
  marketTx,
  type MarketFixture,
} from "../../__fixtures__/load.js";
import { findingCopy } from "../../copy/index.js";
import { decodeTransactionEnvelope } from "../../decode/envelope.js";
import { analyze } from "../../index.js";
import type { ShieldDeps } from "../../types.js";
import { checkedOffers } from "../OFFER_BAD_PRICE.js";

// Every case is a captured testnet market fixture: the order book as Horizon served it just
// before the user's offer was submitted, and that offer. The best bid is 2 MKT per XLM.

const NOW = Date.parse("2026-10-25T11:00:00Z");

function setup(f: MarketFixture, book: unknown = lookup(f, "orderBook").body) {
  const horizon = new FakeHorizonClient();
  const decoded = decodeTransactionEnvelope(marketTx(f).envelopeXdr, "testnet").decoded;
  for (const offer of checkedOffers(decoded, marketTx(f).userAccount)) {
    horizon.orderBooks.set(
      FakeHorizonClient.orderBookKey(offer.selling, offer.buying),
      book instanceof StellixError ? book : orderBookSchema.parse(book),
    );
  }
  const deps: ShieldDeps = {
    horizon,
    toml: { fetchToml: () => Promise.reject(new Error("no toml in this test")) },
    userAccount: marketTx(f).userAccount,
    now: () => NOW,
  };
  return { horizon, deps };
}

async function run(f: MarketFixture, book?: unknown, userAccount?: string) {
  const { horizon, deps } = setup(f, book);
  const report = await analyze(
    {
      kind: "transaction",
      xdr: marketTx(f).envelopeXdr,
      network: "testnet",
      origin: { type: "pasted" },
    },
    userAccount === undefined ? deps : { ...deps, userAccount },
  );
  return {
    horizon,
    findings: report.findings.filter((x) => x.ruleId === "OFFER_BAD_PRICE"),
    unavailable: report.checksUnavailable.filter((c) => c.ruleId === "OFFER_BAD_PRICE"),
  };
}

describe("OFFER_BAD_PRICE", () => {
  it.each([
    ["offer-sell-10pct-below", "1.8", "2", "MKT"],
    ["offer-passive-10pct-below", "1.8", "2", "MKT"],
    ["offer-buy-10pct-below", "1.8", "0.5555555", "XLM"],
  ])("%s: 10%% below the best bid fires", async (name, offerPrice, lossAmount, lossAsset) => {
    const { findings, unavailable } = await run(marketFixture(name));
    expect(unavailable).toEqual([]);
    expect(findings).toEqual([
      {
        ruleId: "OFFER_BAD_PRICE",
        severity: "high",
        confidence: "high",
        opIndex: 0,
        evidence: {
          opNumber: "1",
          selling: "XLM",
          buying: "MKT",
          offerPrice,
          bestBidPrice: "2",
          worseByBps: "1000",
          worsePercent: "10",
          lossAmount,
          lossAsset,
        },
      },
    ]);
    const copy = findingCopy(findings[0]!);
    expect(copy.body).toContain("1.8 MKT per XLM");
    expect(copy.body).toContain(`${lossAmount} ${lossAsset}`);
  });

  it.each(["offer-sell-1pct-below", "offer-passive-1pct-below", "offer-buy-1pct-below"])(
    "%s: 1%% below the best bid doesn't fire",
    async (name) => {
      const { findings, unavailable, horizon } = await run(marketFixture(name));
      expect(findings).toEqual([]);
      expect(unavailable).toEqual([]);
      expect(horizon.count("getOrderBook")).toBe(1);
    },
  );

  it("an empty opposing side (captured) → unavailable, not_found", async () => {
    const f = marketFixture("offer-empty-book");
    expect(orderBookSchema.parse(lookup(f, "orderBook").body).bids).toEqual([]);
    const { findings, unavailable } = await run(f);
    expect(findings).toEqual([]);
    expect(unavailable).toEqual([{ ruleId: "OFFER_BAD_PRICE", reason: "not_found" }]);
  });

  it.each([
    [new StellixError("NETWORK_ERROR", "down", true), "unreachable"],
    [new StellixError("RATE_LIMITED", "limit", true), "unreachable"],
    [new StellixError("HORIZON_BAD_RESPONSE", "bad"), "bad_response"],
  ] as const)("an unavailable order book (%s) → unavailable, %s", async (error, reason) => {
    const { findings, unavailable } = await run(marketFixture("offer-sell-10pct-below"), error);
    expect(findings).toEqual([]);
    expect(unavailable).toEqual([{ ruleId: "OFFER_BAD_PRICE", reason }]);
  });

  it("ignores offers whose effective source isn't the user, and fetches nothing", async () => {
    const f = marketFixture("offer-sell-10pct-below");
    const other = "GDX3XHNB6XNJBRMOWOP4ZQVKL5CFMXD4MJFXFICFVGR7J2KQXMDIANZD";
    const { findings, unavailable, horizon } = await run(f, undefined, other);
    expect(findings).toEqual([]);
    expect(unavailable).toEqual([]);
    expect(horizon.count("getOrderBook")).toBe(0);
  });

  it("skips offer deletions (amount 0)", () => {
    const f = fixture("manageSellOffer-delete");
    const decoded = decodeTransactionEnvelope(f.envelopeXdr, "testnet").decoded;
    expect(checkedOffers(decoded, f.transaction.body.source_account)).toEqual([]);
  });

  it("checks a captured offer update the same as a new offer", () => {
    const f = fixture("manageSellOffer-update");
    const decoded = decodeTransactionEnvelope(f.envelopeXdr, "testnet").decoded;
    expect(checkedOffers(decoded, f.transaction.body.source_account)).toHaveLength(1);
  });

  it("a buy offer's price is inverted to buying per selling", () => {
    const f = marketFixture("offer-buy-10pct-below");
    const decoded = decodeTransactionEnvelope(marketTx(f).envelopeXdr, "testnet").decoded;
    expect(decoded.operations[0]).toMatchObject({
      kind: "manageBuyOffer",
      price: { n: 5n, d: 9n },
    });
    expect(checkedOffers(decoded, marketTx(f).userAccount)[0]?.sellPrice).toEqual({ n: 9n, d: 5n });
  });
});
