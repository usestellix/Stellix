import type { AccountSummary, KeyValueStore, NetworkId } from "@stellix/core";
import { browser } from "wxt/browser";
import { createChromeKeyValueStore } from "../../storage/chrome-key-value-store.js";

// Popup-owned memory in chrome.storage.session, all under "ui:" so it never collides with the
// SW's keys. Public data only (account IDs, balances). Cleared on browser exit and on reset.

export const UI_PREFIX = "ui:";

export function uiSessionStore(): KeyValueStore {
  return createChromeKeyValueStore(browser.storage.session);
}

/** Stored as strings: bigint doesn't survive storage. */
interface StoredBalance {
  totalStroops: string;
  reservedStroops: string;
  availableStroops: string;
  at: number;
}

export interface LastKnownBalance {
  totalStroops: bigint;
  reservedStroops: bigint;
  availableStroops: bigint;
  at: number;
}

const balanceKey = (network: NetworkId, id: string) => `${UI_PREFIX}lastBalance:${network}:${id}`;
const fundedKey = (network: NetworkId, id: string) => `${UI_PREFIX}fundedSeen:${network}:${id}`;

export async function rememberBalance(
  store: KeyValueStore,
  network: NetworkId,
  id: string,
  summary: Extract<AccountSummary, { funded: true }>,
  at: number,
): Promise<void> {
  const value: StoredBalance = {
    totalStroops: summary.totalStroops.toString(),
    reservedStroops: summary.reservedStroops.toString(),
    availableStroops: summary.availableStroops.toString(),
    at,
  };
  await store.set(balanceKey(network, id), value);
  await store.set(fundedKey(network, id), true);
}

export async function lastKnownBalance(
  store: KeyValueStore,
  network: NetworkId,
  id: string,
): Promise<LastKnownBalance | null> {
  const raw = await store.get<unknown>(balanceKey(network, id));
  if (typeof raw !== "object" || raw === null) return null;
  const v = raw as Partial<StoredBalance>;
  const digits = (s: unknown) => typeof s === "string" && /^\d+$/.test(s);
  if (
    !digits(v.totalStroops) ||
    !digits(v.reservedStroops) ||
    !digits(v.availableStroops) ||
    typeof v.at !== "number"
  ) {
    return null;
  }
  return {
    totalStroops: BigInt(v.totalStroops as string),
    reservedStroops: BigInt(v.reservedStroops as string),
    availableStroops: BigInt(v.availableStroops as string),
    at: v.at,
  };
}

/** Seen funded earlier this browser session (UI_FLOWS §4 "testnet reset detected"). */
export async function wasFundedThisSession(
  store: KeyValueStore,
  network: NetworkId,
  id: string,
): Promise<boolean> {
  return (await store.get<unknown>(fundedKey(network, id))) === true;
}

export async function forgetBalance(
  store: KeyValueStore,
  network: NetworkId,
  id: string,
): Promise<void> {
  await store.remove(balanceKey(network, id));
}
