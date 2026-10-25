import type { OrderBook, PathRecord } from "../network/horizon-schemas.js";
import { pairKey, unavailableFrom } from "./lookups.js";
import { checkedOffers } from "./rules/OFFER_BAD_PRICE.js";
import { checkedPathPayments } from "./rules/PATH_LOW_MIN.js";
import type { DecodedRequest, RuleData, RuleUnavailable, ShieldDeps } from "./types.js";

// analyze's gather step (SHIELD §6.4): everything the rules need from the network is fetched
// here, before they run, so rules stay pure. A failed lookup is kept as RuleUnavailable with its
// reason; it's never dropped and never fatal to the analysis.

async function lookup<T>(fetch: () => Promise<T>): Promise<T | RuleUnavailable> {
  try {
    return await fetch();
  } catch (error) {
    return unavailableFrom(error);
  }
}

export async function gather(decoded: DecodedRequest, deps: ShieldDeps): Promise<RuleData> {
  // One request per distinct pair, sequentially: public Horizon is rate-limited per IP.
  const orderBooks = new Map<string, OrderBook | RuleUnavailable>();
  for (const { selling, buying } of checkedOffers(decoded, deps.userAccount)) {
    const key = pairKey(selling, buying);
    if (!orderBooks.has(key)) {
      orderBooks.set(key, await lookup(() => deps.horizon.getOrderBook(selling, buying)));
    }
  }
  const paths = new Map<number, PathRecord[] | RuleUnavailable>();
  for (const p of checkedPathPayments(decoded, deps.userAccount)) {
    paths.set(
      p.opIndex,
      await lookup(() =>
        p.mode === "strictSend"
          ? deps.horizon.getStrictSendPaths(p.sendAsset, p.fixedStroops, p.destAsset)
          : deps.horizon.getStrictReceivePaths(p.sendAsset, p.destAsset, p.fixedStroops),
      ),
    );
  }
  return { orderBooks, paths };
}
