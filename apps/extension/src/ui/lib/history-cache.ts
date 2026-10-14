import type { HistoryItem, HistoryList, KeyValueStore, NetworkId } from "@stellix/core";
import { z } from "zod";
import { UI_PREFIX } from "./ui-session.js";

// First history pages, cached in chrome.storage.session under "ui:" (public data only), so
// reopening the popup renders at once. Always followed by a page-1 refetch (use-history).

// Same setting as messaging/protocol.ts: no runtime code generation (CLAUDE.md §6.12).
z.config({ jitless: true });

/** Enough for Home and a scroll or two; older pages are refetched on demand. */
export const HISTORY_CACHE_MAX_ITEMS = 60;

const digits = z.string().regex(/^\d+$/);
const itemSchema = z.object({
  id: digits,
  pagingToken: digits,
  hash: z.string(),
  at: z.string(),
  direction: z.enum(["in", "out", "self"]),
  kind: z.enum(["payment", "account_created", "account_merged"]),
  counterparty: z.string(),
  amountStroops: digits.nullable(),
  memo: z.object({ type: z.enum(["text", "id", "hash", "return"]), value: z.string() }).optional(),
  muxedId: z.string().optional(),
  successful: z.boolean(),
  fee: z.object({ stroops: digits, operationCount: z.number().int().positive() }).optional(),
});
const listSchema = z.object({ items: z.array(itemSchema), nextCursor: digits.nullable() });

const key = (network: NetworkId, id: string) => `${UI_PREFIX}history:${network}:${id}`;

export async function readHistoryCache(
  store: KeyValueStore,
  network: NetworkId,
  id: string,
): Promise<HistoryList | null> {
  const parsed = listSchema.safeParse(await store.get<unknown>(key(network, id)));
  if (!parsed.success) return null;
  // exactOptionalPropertyTypes: rebuild without undefined-valued optionals.
  const items = parsed.data.items.map(({ memo, muxedId, fee, ...rest }): HistoryItem => ({
    ...rest,
    ...(memo !== undefined ? { memo } : {}),
    ...(muxedId !== undefined ? { muxedId } : {}),
    ...(fee !== undefined ? { fee } : {}),
  }));
  return { items, nextCursor: parsed.data.nextCursor };
}

export async function writeHistoryCache(
  store: KeyValueStore,
  network: NetworkId,
  id: string,
  list: HistoryList,
): Promise<void> {
  const items = list.items.slice(0, HISTORY_CACHE_MAX_ITEMS);
  const last = items.at(-1);
  // Truncated → continue from the last kept item (its paging token is a valid cursor).
  const nextCursor =
    items.length < list.items.length && last !== undefined ? last.pagingToken : list.nextCursor;
  await store.set(key(network, id), { items, nextCursor });
}
