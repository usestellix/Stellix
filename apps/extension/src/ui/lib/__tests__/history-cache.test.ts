import type { HistoryItem } from "@stellix/core";
import { MemoryKeyValueStore } from "@stellix/core/testing";
import { describe, expect, it } from "vitest";
import { HISTORY_CACHE_MAX_ITEMS, readHistoryCache, writeHistoryCache } from "../history-cache.js";

const ME = "GCALNQQBXAPZ2WIRSDDBMSTAKCUH5SG6U76YBFLQLIXJTF7FE5AX7AOO";
const item = (id: number, patch: Partial<HistoryItem> = {}): HistoryItem => ({
  id: String(id),
  pagingToken: String(id),
  hash: "h",
  at: "2026-10-14T10:00:00Z",
  direction: "out",
  kind: "payment",
  counterparty: ME,
  amountStroops: "1",
  successful: true,
  ...patch,
});

describe("history cache (ui: session storage)", () => {
  it("round-trips items with optional fields, keyed per network and account", async () => {
    const store = new MemoryKeyValueStore();
    const items = [
      item(3, { memo: { type: "text", value: "hi" }, fee: { stroops: "400", operationCount: 4 } }),
      item(2, { kind: "account_merged", amountStroops: null, muxedId: "7" }),
    ];
    await writeHistoryCache(store, "testnet", ME, { items, nextCursor: "2" });
    expect(await readHistoryCache(store, "testnet", ME)).toEqual({ items, nextCursor: "2" });
    expect(await readHistoryCache(store, "mainnet", ME)).toBeNull();
    expect(await store.keys()).toEqual([`ui:history:testnet:${ME}`]);
  });

  it("caps the size and continues from the last kept item", async () => {
    const store = new MemoryKeyValueStore();
    const items = Array.from({ length: HISTORY_CACHE_MAX_ITEMS + 5 }, (_, k) => item(1000 - k));
    await writeHistoryCache(store, "testnet", ME, { items, nextCursor: null });
    const back = await readHistoryCache(store, "testnet", ME);
    expect(back?.items).toHaveLength(HISTORY_CACHE_MAX_ITEMS);
    expect(back?.nextCursor).toBe(back?.items.at(-1)?.pagingToken);
  });

  it("ignores anything malformed", async () => {
    const store = new MemoryKeyValueStore();
    const key = `ui:history:testnet:${ME}`;
    for (const bad of [
      "x",
      { items: [{ id: "1" }], nextCursor: null },
      { items: [item(1, { amountStroops: "1.5" })], nextCursor: null },
      { items: [], nextCursor: "abc" },
    ]) {
      await store.set(key, bad);
      expect(await readHistoryCache(store, "testnet", ME)).toBeNull();
    }
  });
});
