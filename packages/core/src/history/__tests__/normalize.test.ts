import { describe, expect, it } from "vitest";
import { fixture } from "../../network/__tests__/fixtures.js";
import type { EffectRecord, HistoryRecord } from "../../network/horizon-schemas.js";
import {
  isAccountOrigin,
  mergeAmountFromEffects,
  mergeHistoryItems,
  normalizeHistory,
  normalizeHistoryRecord,
  type HistoryItem,
} from "../normalize.js";

// All records are captured from testnet (scripts/capture-horizon-fixtures.mjs). The capture
// script defines what happened: `me` paid peer 3 XLM, peer's M address 1.25 XLM, created an
// account with 2 XLM and path-paid 0.5 XLM in one 4-op tx (memo text "history fixture"); peer
// paid me 7.5 XLM (memo id 9001); another account merged into me; then me sent 25 payments
// of 1..25 XLM in one tx.
const ids = fixture("history-me").body as {
  id: string;
  peer: string;
  peerMuxed: string;
  created: string;
  merged: string;
};
const me = ids.id;
const records = (name: "history-page" | "history-multiop-page1" | "history-multiop-page2") =>
  (fixture(name).body as { _embedded: { records: HistoryRecord[] } })._embedded.records;
const xlm = (n: number) => BigInt(Math.round(n * 1e7)).toString();

describe("normalizeHistory (NETWORK §5)", () => {
  const items = normalizeHistory(records("history-page"), me);

  it("normalizes every record type with direction, counterparty and amount", () => {
    expect(
      items.map(({ kind, direction, counterparty, amountStroops }) => ({
        kind,
        direction,
        counterparty,
        amountStroops,
      })),
    ).toEqual([
      { kind: "account_merged", direction: "in", counterparty: ids.merged, amountStroops: null },
      { kind: "payment", direction: "in", counterparty: ids.peer, amountStroops: xlm(7.5) },
      { kind: "payment", direction: "out", counterparty: ids.peer, amountStroops: xlm(0.5) },
      {
        kind: "account_created",
        direction: "out",
        counterparty: ids.created,
        amountStroops: xlm(2),
      },
      { kind: "payment", direction: "out", counterparty: ids.peerMuxed, amountStroops: xlm(1.25) },
      { kind: "payment", direction: "out", counterparty: ids.peer, amountStroops: xlm(3) },
      {
        kind: "account_created",
        direction: "in",
        counterparty: expect.stringMatching(/^G/) as string,
        amountStroops: xlm(10_000),
      },
    ]);
  });

  it("keeps the muxed counterparty as used on chain (to_muxed)", () => {
    expect(items[4]!.counterparty).toMatch(/^M/);
  });

  it("carries memos from the joined transaction (text and id) and omits none", () => {
    expect(items[1]!.memo).toEqual({ type: "id", value: "9001" });
    for (const i of [2, 3, 4, 5])
      expect(items[i]!.memo).toEqual({ type: "text", value: "history fixture" });
    expect(items[0]!.memo).toBeUndefined();
    expect(items[6]!.memo).toBeUndefined();
  });

  it("carries id, paging token, hash, time and success", () => {
    const raw = records("history-page")[1]!;
    expect(items[1]).toMatchObject({
      id: raw.id,
      pagingToken: raw.paging_token,
      hash: raw.transaction_hash,
      at: raw.created_at,
      successful: true,
    });
  });
});

describe("fee attribution", () => {
  it("adds the fee only when this account is the transaction's fee_account", () => {
    const items = normalizeHistory(records("history-page"), me);
    // Incoming payment, merge in and Friendbot's create_account: someone else paid.
    for (const i of [0, 1, 6]) expect(items[i]!.fee).toBeUndefined();
    // The 4-op tx we paid for: the WHOLE tx fee, flagged as multi-op.
    for (const i of [2, 3, 4, 5])
      expect(items[i]!.fee).toEqual({ stroops: "400", operationCount: 4 });
  });

  it("the 25-op transaction: one tx fee for all 25 operations, across both pages", () => {
    const page1 = normalizeHistory(records("history-multiop-page1"), me);
    const page2 = normalizeHistory(records("history-multiop-page2"), me);
    const batch = [...page1, ...page2.slice(0, 5)];
    expect(batch).toHaveLength(25);
    expect(new Set(batch.map((i) => i.hash)).size).toBe(1);
    expect(batch.map((i) => i.amountStroops)).toEqual(
      Array.from({ length: 25 }, (_, k) => xlm(25 - k)),
    );
    for (const item of batch) {
      expect(item).toMatchObject({ direction: "out", counterparty: ids.peer });
      expect(item.fee).toEqual({ stroops: "2500", operationCount: 25 });
    }
  });

  it("the same transaction seen by the recipient carries no fee", () => {
    const [record] = records("history-multiop-page1");
    expect(normalizeHistoryRecord(record!, ids.peer)).toMatchObject({ direction: "in" });
    expect(normalizeHistoryRecord(record!, ids.peer)?.fee).toBeUndefined();
  });
});

describe("hidden records (XLM only in the MVP)", () => {
  const base = () => structuredClone(records("history-page"));
  const payment = () => base()[5]!;
  const path = () => base()[2]!;

  it("hides non-native payments", () => {
    expect(normalizeHistoryRecord({ ...payment(), asset_type: "credit_alphanum4" }, me)).toBeNull();
  });

  it("hides outgoing path payments not paid in XLM, incoming ones not delivering XLM", () => {
    expect(
      normalizeHistoryRecord({ ...path(), source_asset_type: "credit_alphanum4" }, me),
    ).toBeNull();
    expect(
      normalizeHistoryRecord({ ...path(), asset_type: "credit_alphanum4" }, ids.peer),
    ).toBeNull();
    // Paid in XLM, delivered in another asset: still an XLM outflow for us.
    expect(normalizeHistoryRecord({ ...path(), asset_type: "credit_alphanum4" }, me)).toMatchObject(
      {
        direction: "out",
        amountStroops: xlm(0.5),
      },
    );
  });

  it("hides other operation types and records unrelated to this account", () => {
    expect(normalizeHistoryRecord({ ...payment(), type: "manage_sell_offer" }, me)).toBeNull();
    expect(normalizeHistoryRecord(payment(), ids.created)).toBeNull();
  });

  it("shows a payment to our own muxed address as self", () => {
    const r = { ...payment(), to: me, to_muxed: ids.peerMuxed };
    expect(normalizeHistoryRecord(r, me)).toMatchObject({ direction: "self", counterparty: me });
  });

  it("records the recipient ID of an incoming muxed payment", () => {
    const r = records("history-page")[4]!; // me → peer's M address
    expect(normalizeHistoryRecord(r, ids.peer)).toMatchObject({
      direction: "in",
      muxedId: "424242",
      counterparty: me,
    });
  });
});

describe("mergeAmountFromEffects", () => {
  const effects = (
    fixture("effects-account-merge").body as { _embedded: { records: EffectRecord[] } }
  )._embedded.records;

  it("reads what the receiving account was credited", () => {
    expect(mergeAmountFromEffects(effects, me, "in")).toBe("99999999900");
  });

  it("reads what the merged account was debited; unknown → null", () => {
    expect(mergeAmountFromEffects(effects, ids.merged, "out")).toBe("99999999900");
    expect(mergeAmountFromEffects(effects, ids.peer, "in")).toBeNull();
  });
});

describe("mergeHistoryItems", () => {
  const item = (id: string, patch: Partial<HistoryItem> = {}): HistoryItem => ({
    id,
    pagingToken: id,
    hash: "h",
    at: "2026-10-14T00:00:00Z",
    direction: "in",
    kind: "payment",
    counterparty: "G",
    amountStroops: "1",
    successful: true,
    ...patch,
  });

  it("dedupes by operation id, newest first, fresh items win", () => {
    const merged = mergeHistoryItems(
      [item("30"), item("10", { amountStroops: "old" })],
      [item("10", { amountStroops: "new" }), item("40"), item("200")],
    );
    expect(merged.map((i) => i.id)).toEqual(["200", "40", "30", "10"]);
    expect(merged[3]!.amountStroops).toBe("new");
  });

  it("keeps a merge amount already loaded from effects", () => {
    const merged = mergeHistoryItems(
      [item("5", { kind: "account_merged", amountStroops: "77" })],
      [item("5", { kind: "account_merged", amountStroops: null })],
    );
    expect(merged[0]!.amountStroops).toBe("77");
  });
});

describe("isAccountOrigin", () => {
  it("is the create_account that funded us: the oldest record of the captured history", () => {
    const page2 = normalizeHistory(records("history-multiop-page2"), me);
    expect(isAccountOrigin(page2.at(-1)!)).toBe(true);
    expect(page2.slice(0, -1).some(isAccountOrigin)).toBe(false);
  });
});
