import type { Logger } from "../log.js";
import type { KeyValueStore } from "../platform.js";
import type { NetworkId } from "./config.js";
import type { HorizonClient } from "./horizon-client.js";

// Base reserve (NETWORK.md §7): read from the latest ledger, cached per network for the session.

export const FALLBACK_BASE_RESERVE_STROOPS = 5_000_000n;

export interface BaseReserveCache {
  store: KeyValueStore;
  /** e.g. "ui:" in the popup, so cache keys never collide with SW session keys. */
  prefix: string;
}

export async function getBaseReserveStroops(
  network: NetworkId,
  horizon: HorizonClient,
  cache: BaseReserveCache,
  log?: Logger,
): Promise<bigint> {
  const key = `${cache.prefix}baseReserve:${network}`;
  const cached = await cache.store.get<unknown>(key);
  if (typeof cached === "string" && /^\d+$/.test(cached)) return BigInt(cached);
  try {
    const ledger = await horizon.getLatestLedger();
    const value = BigInt(ledger.base_reserve_in_stroops);
    await cache.store.set(key, value.toString());
    return value;
  } catch {
    // Never cached: the next call tries Horizon again.
    log?.warn("base reserve unavailable; using fallback", { network });
    return FALLBACK_BASE_RESERVE_STROOPS;
  }
}
