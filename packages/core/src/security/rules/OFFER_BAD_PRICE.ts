import type { DecodedAsset, DecodedPrice } from "../decode/operation-types.js";
import { resolveSources } from "../decode/sources.js";
import { isUnavailable, pairKey } from "../lookups.js";
import type { DecodedRequest, Finding, Rule } from "../types.js";
import { formatRatio, formatStroops } from "./format.js";
import { THRESHOLDS } from "./thresholds.js";

/**
 * OFFER_BAD_PRICE (SHIELD §6.1, §6.7): an offer from the user priced worse than the best
 * opposing order-book price by more than the threshold.
 *
 * Every price here is in units of `buying` per unit of `selling`, the way Horizon prices both
 * sides of `GET /order_book?selling=…&buying=…` (stellar-horizon internal/db2/history/
 * orderbook.go inverts the bids). manageSellOffer and createPassiveSellOffer prices are already
 * buying per selling; a manageBuyOffer price is selling per buying, so it's inverted. The
 * opposing side of the user's offer is the bids; bids[0] is the best (highest) one.
 */

/** An offer this rule checks: from the user, not a deletion, with a valid price. */
export interface CheckedOffer {
  opIndex: number;
  selling: DecodedAsset;
  buying: DecodedAsset;
  /** Buying per selling. */
  sellPrice: DecodedPrice;
  /** What's fixed: the amount sold (sell offers) or bought (buy offers), in stroops. */
  amount: { side: "selling" | "buying"; stroops: bigint };
}

const valid = (p: DecodedPrice) => p.n > 0n && p.d > 0n;

/**
 * The offers the rule checks, in op order. Shared with the gather step, so it fetches exactly
 * the order books the rule reads. A non-positive price or amount is skipped: the network
 * rejects the transaction, so nothing can be lost.
 */
export function checkedOffers(decoded: DecodedRequest, userAccount: string): CheckedOffer[] {
  const sources = resolveSources(decoded, userAccount);
  const out: CheckedOffer[] = [];
  decoded.operations.forEach((op, opIndex) => {
    if (sources.ops[opIndex]?.isUser !== true) return;
    switch (op.kind) {
      case "manageSellOffer":
      case "createPassiveSellOffer":
        if (op.amountStroops > 0n && valid(op.price)) {
          out.push({
            opIndex,
            selling: op.selling,
            buying: op.buying,
            sellPrice: op.price,
            amount: { side: "selling", stroops: op.amountStroops },
          });
        }
        return;
      case "manageBuyOffer":
        if (op.buyAmountStroops > 0n && valid(op.price)) {
          out.push({
            opIndex,
            selling: op.selling,
            buying: op.buying,
            sellPrice: { n: op.price.d, d: op.price.n },
            amount: { side: "buying", stroops: op.buyAmountStroops },
          });
        }
        return;
      default:
        return;
    }
  });
  return out;
}

function assetLabel(asset: DecodedAsset): string {
  return asset.type === "native" ? "XLM" : asset.code;
}

const BPS = 10_000n;

export const OFFER_BAD_PRICE: Rule = {
  id: "OFFER_BAD_PRICE",
  evaluate(ctx) {
    const findings: Finding[] = [];
    for (const offer of checkedOffers(ctx.decoded, ctx.userAccount)) {
      const book = ctx.data.orderBooks.get(pairKey(offer.selling, offer.buying));
      if (book === undefined) return { unavailable: true, reason: "internal" };
      if (isUnavailable(book)) return book;
      const best = book.bids[0];
      // No opposing offers: no reference price, which is never a pass (§6.7).
      if (best === undefined) return { unavailable: true, reason: "not_found" };

      const bid = { n: BigInt(best.price_r.n), d: BigInt(best.price_r.d) };
      const p = offer.sellPrice;
      // bid − p = shortfall / (bid.d · p.d); relative to bid: shortfall / (bid.n · p.d).
      const shortfall = bid.n * p.d - p.n * bid.d;
      const scale = bid.n * p.d;
      const maxBps = BigInt(THRESHOLDS.OFFER_BAD_PRICE.maxWorseThanBestBps);
      if (shortfall <= 0n || shortfall * BPS <= maxBps * scale) continue;

      const worseByBps = (shortfall * BPS) / scale;
      // Selling a fixed amount: up to amount · (bid − p) less of `buying` received.
      // Buying a fixed amount: up to amount · (1/p − 1/bid) more of `selling` paid.
      const loss =
        offer.amount.side === "selling"
          ? { stroops: (offer.amount.stroops * shortfall) / (bid.d * p.d), asset: offer.buying }
          : { stroops: (offer.amount.stroops * shortfall) / (bid.n * p.n), asset: offer.selling };

      findings.push({
        ruleId: "OFFER_BAD_PRICE",
        severity: "high",
        confidence: "high",
        opIndex: offer.opIndex,
        evidence: {
          opNumber: String(offer.opIndex + 1),
          selling: assetLabel(offer.selling),
          buying: assetLabel(offer.buying),
          offerPrice: formatRatio(p.n, p.d),
          bestBidPrice: formatRatio(bid.n, bid.d),
          worseByBps: worseByBps.toString(),
          worsePercent: formatRatio(worseByBps, 100n, 2),
          lossAmount: formatStroops(loss.stroops),
          lossAsset: assetLabel(loss.asset),
        },
      });
    }
    return findings;
  },
};
