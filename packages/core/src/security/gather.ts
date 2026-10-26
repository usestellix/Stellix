import type { OrderBook, PathRecord } from "../network/horizon-schemas.js";
import { requiresMemo } from "../tx/sep29.js";
import { isUnavailable, pairKey, unavailableFrom } from "./lookups.js";
import { checkedMasterKeyOps } from "./rules/ACCT_MASTER_WEIGHT.js";
import { checkedMemoDestinations } from "./rules/MEMO_REQUIRED.js";
import { checkedOffers } from "./rules/OFFER_BAD_PRICE.js";
import { checkedPathPayments } from "./rules/PATH_LOW_MIN.js";
import { checkedTrustlines } from "./rules/trust.js";
import type { DecodedRequest, IssuerInfo, RuleData, RuleUnavailable, ShieldDeps } from "./types.js";

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

async function issuerInfo(issuer: string, deps: ShieldDeps): Promise<IssuerInfo | RuleUnavailable> {
  const account = await lookup(() => deps.horizon.getAccount(issuer));
  if (isUnavailable(account)) return account;
  // A trustline to an asset whose issuer doesn't exist can't be created.
  if (account === null) return { unavailable: true, reason: "not_found" };
  const homeDomain = account.home_domain ?? null;
  return {
    homeDomain,
    clawbackEnabled: account.flags?.auth_clawback_enabled ?? null,
    toml: homeDomain === null ? null : await lookup(() => deps.toml.fetchToml(homeDomain)),
  };
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
  const issuers = new Map<string, IssuerInfo | RuleUnavailable>();
  for (const { issuer } of checkedTrustlines(decoded, deps.userAccount)) {
    if (!issuers.has(issuer)) issuers.set(issuer, await issuerInfo(issuer, deps));
  }
  const memoRequired = new Map<string, boolean | RuleUnavailable>();
  for (const { destination } of checkedMemoDestinations(decoded)) {
    if (memoRequired.has(destination)) continue;
    const account = await lookup(() => deps.horizon.getAccount(destination));
    memoRequired.set(
      destination,
      isUnavailable(account) ? account : account !== null && requiresMemo(account),
    );
  }
  const data: RuleData = { orderBooks, paths, issuers, memoRequired };
  if (checkedMasterKeyOps(decoded, deps.userAccount).length > 0) {
    data.userAccount = await lookup(() => deps.horizon.getAccount(deps.userAccount));
  }
  return data;
}
