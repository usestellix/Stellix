import type { HistoryRecord } from "@stellix/core";
import { FakeHorizonClient, MemoryKeyValueStore } from "@stellix/core/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { readHistoryCache, writeHistoryCache } from "../history-cache.js";
import { HISTORY_POLL_MS, createHistoryController } from "../history-controller.js";

const ME = "GCALNQQBXAPZ2WIRSDDBMSTAKCUH5SG6U76YBFLQLIXJTF7FE5AX7AOO";
const PEER = "GDHWA726NGVLH4WUPB4R43JZMSB2XGWFGTP6EZNI7BSGIIYK5SSNY3VK";

/** A native payment record as Horizon returns it with join=transactions. */
function rec(id: number, patch: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
    id: String(id),
    paging_token: String(id),
    type: "payment",
    transaction_hash: `h${String(id)}`,
    created_at: "2026-10-14T10:00:00Z",
    transaction_successful: true,
    from: PEER,
    to: ME,
    asset_type: "native",
    amount: "1.0000000",
    transaction: { memo_type: "none", fee_account: PEER, fee_charged: "100", operation_count: 1 },
    ...patch,
  };
}
const desc = (from: number, to: number) =>
  Array.from({ length: from - to + 1 }, (_, k) => rec(from - k));

class FakeSource {
  static last: FakeSource | null = null;
  static opened: string[] = [];
  onmessage: ((e: MessageEvent<unknown>) => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 1;
  closed = false;
  constructor(readonly url: string) {
    FakeSource.last = this;
    FakeSource.opened.push(url);
  }
  close() {
    this.closed = true;
    this.readyState = 2;
  }
  emit(data: unknown) {
    this.onmessage?.({
      data: typeof data === "string" ? data : JSON.stringify(data),
    } as MessageEvent);
  }
  fail(readyState: 0 | 2) {
    this.readyState = readyState;
    this.onerror?.();
  }
}

function setup(opts: { visible?: () => boolean } = {}) {
  const horizon = new FakeHorizonClient();
  const store = new MemoryKeyValueStore();
  const timers: { fn: () => void; ms: number; cleared: boolean }[] = [];
  const controller = createHistoryController({
    me: ME,
    network: "testnet",
    horizon,
    store,
    streamUrl: (cursor) => `stream?cursor=${cursor}`,
    EventSource: FakeSource,
    isVisible: opts.visible ?? (() => true),
    setInterval: (fn, ms) => {
      const t = { fn, ms, cleared: false };
      timers.push(t);
      return t;
    },
    clearInterval: (t) => {
      (t as { cleared: boolean }).cleared = true;
    },
  });
  const tick = async () => {
    for (const t of timers) if (!t.cleared) t.fn();
    await flush();
  };
  return { horizon, store, controller, timers, tick };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const ids = (c: ReturnType<typeof setup>["controller"]) =>
  c.snapshot().items.map((i) => Number(i.id));

beforeEach(() => {
  FakeSource.last = null;
  FakeSource.opened = [];
});

describe("history controller: open", () => {
  it("no cache: fetches page 1, then streams from the newest record; caches the page", async () => {
    const { horizon, store, controller } = setup();
    horizon.history.set(ME, desc(30, 1));
    await controller.start();
    expect(controller.snapshot()).toMatchObject({ phase: "ready", live: "stream", activity: 0 });
    expect(ids(controller)).toEqual(desc(30, 11).map((r) => Number(r.id)));
    expect(controller.snapshot().nextCursor).toBe("11");
    expect(FakeSource.opened).toEqual(["stream?cursor=30"]);
    expect((await readHistoryCache(store, "testnet", ME))?.items).toHaveLength(20);
  });

  it("cache first, then ALWAYS page 1: payments that arrived while closed appear", async () => {
    const { horizon, store, controller } = setup();
    await writeHistoryCache(store, "testnet", ME, {
      items: [{ ...stub(5) }, { ...stub(4) }],
      nextCursor: null,
    });
    horizon.history.set(ME, desc(7, 4)); // 7 and 6 arrived while the popup was closed
    const seen: number[][] = [];
    controller.subscribe(() => seen.push(ids(controller)));
    await controller.start();
    expect(seen[0]).toEqual([5, 4]); // cached rows rendered before the network answered
    expect(ids(controller)).toEqual([7, 6, 5, 4]);
    expect(horizon.count("getHistoryPage")).toBe(1);
    expect(FakeSource.opened).toEqual(["stream?cursor=7"]);
  });

  it("an empty account streams from now", async () => {
    const { controller } = setup();
    await controller.start();
    expect(controller.snapshot()).toMatchObject({ phase: "ready", items: [] });
    expect(FakeSource.opened).toEqual(["stream?cursor=now"]);
  });

  it("page 1 fails with nothing cached → error, Retry recovers", async () => {
    const { horizon, controller } = setup();
    horizon.failingHistory.add(ME);
    await controller.start();
    expect(controller.snapshot()).toMatchObject({ phase: "error", error: "NETWORK_ERROR" });
    horizon.failingHistory.delete(ME);
    horizon.history.set(ME, desc(2, 1));
    await controller.refresh();
    expect(controller.snapshot()).toMatchObject({ phase: "ready", error: null });
    expect(ids(controller)).toEqual([2, 1]);
  });

  it("page 1 fails with a cache → cached rows stay, polling takes over", async () => {
    const { horizon, store, controller, timers } = setup();
    await writeHistoryCache(store, "testnet", ME, { items: [stub(3)], nextCursor: null });
    horizon.failingHistory.add(ME);
    await controller.start();
    expect(controller.snapshot()).toMatchObject({ phase: "ready", live: "polling" });
    expect(ids(controller)).toEqual([3]);
    expect(timers.map((t) => t.ms)).toEqual([HISTORY_POLL_MS]);
  });
});

describe("history controller: live", () => {
  it("streamed payments are prepended once and count as activity; junk is ignored", async () => {
    const { horizon, controller } = setup();
    horizon.history.set(ME, desc(2, 1));
    await controller.start();
    const source = FakeSource.last!;
    source.emit("hello");
    source.emit("not json {");
    source.emit({ id: "x" });
    source.emit(rec(3));
    source.emit(rec(3));
    source.emit(rec(4, { asset_type: "credit_alphanum4" })); // hidden in the MVP
    expect(ids(controller)).toEqual([3, 2, 1]);
    expect(controller.snapshot().activity).toBe(1);
  });

  it("a transient error lets EventSource reconnect; a closed stream falls back to polling", async () => {
    const { horizon, controller, timers, tick } = setup();
    horizon.history.set(ME, desc(1, 1));
    await controller.start();
    FakeSource.last!.fail(0);
    expect(controller.snapshot().live).toBe("stream");
    FakeSource.last!.fail(2);
    expect(controller.snapshot().live).toBe("polling");
    expect(timers).toHaveLength(1);

    horizon.history.set(ME, desc(2, 1));
    await tick();
    expect(ids(controller)).toEqual([2, 1]);
    expect(controller.snapshot().activity).toBe(1);
    await tick(); // nothing new → no extra activity
    expect(controller.snapshot().activity).toBe(1);
  });

  it("unfunded (stream 404 → closed): polling picks up the activating payment", async () => {
    const { horizon, controller, tick } = setup();
    await controller.start();
    FakeSource.last!.fail(2);
    horizon.history.set(ME, [
      rec(9, { type: "create_account", account: ME, funder: PEER, starting_balance: "5.0000000" }),
    ]);
    await tick();
    expect(controller.snapshot().items[0]).toMatchObject({
      kind: "account_created",
      direction: "in",
    });
    expect(controller.snapshot().activity).toBe(1);
  });

  it("polls only while the popup is visible", async () => {
    let visible = false;
    const { horizon, controller, tick } = setup({ visible: () => visible });
    horizon.failingHistory.add(ME);
    await controller.start();
    horizon.failingHistory.delete(ME);
    const before = horizon.count("getHistoryPage");
    await tick();
    expect(horizon.count("getHistoryPage")).toBe(before);
    visible = true;
    await tick();
    expect(horizon.count("getHistoryPage")).toBe(before + 1);
  });

  it("stop() closes the stream, clears the poll, and ignores late results", async () => {
    const { horizon, controller, timers } = setup();
    horizon.history.set(ME, desc(1, 1));
    await controller.start();
    const source = FakeSource.last!;
    source.fail(2);
    controller.stop();
    expect(timers[0]!.cleared).toBe(true);
    source.emit(rec(5));
    expect(ids(controller)).toEqual([1]);

    const second = setup();
    second.horizon.history.set(ME, desc(1, 1));
    await second.controller.start();
    second.controller.stop();
    expect(FakeSource.last!.closed).toBe(true);
  });
});

describe("history controller: restart (React StrictMode runs effects twice)", () => {
  it("stop() then start() runs again; the stopped run's late results are dropped", async () => {
    const { horizon, controller } = setup();
    horizon.history.set(ME, desc(2, 1));
    const first = controller.start();
    controller.stop();
    horizon.history.set(ME, desc(3, 1));
    await controller.start();
    await first;
    expect(ids(controller)).toEqual([3, 2, 1]);
    expect(FakeSource.opened).toEqual(["stream?cursor=3"]);
    expect(controller.snapshot().live).toBe("stream");
  });
});

describe("history controller: paging and merges", () => {
  it("loads older pages by cursor until the end", async () => {
    const { horizon, controller } = setup();
    horizon.history.set(ME, desc(45, 1));
    await controller.start();
    await controller.loadMore();
    expect(controller.snapshot().items).toHaveLength(40);
    await controller.loadMore();
    expect(controller.snapshot()).toMatchObject({ nextCursor: null, more: "idle" });
    expect(ids(controller)).toEqual(desc(45, 1).map((r) => Number(r.id)));
    await controller.loadMore(); // at the end: no request
    expect(horizon.count("getHistoryPage")).toBe(3);
  });

  it("skips over pages that hold only hidden records", async () => {
    const { horizon, controller } = setup();
    const hidden = (id: number) => rec(id, { asset_type: "credit_alphanum4" });
    horizon.history.set(ME, [
      ...desc(60, 41),
      ...Array.from({ length: 20 }, (_, k) => hidden(40 - k)),
      ...desc(20, 15),
    ]);
    await controller.start();
    await controller.loadMore();
    expect(ids(controller).slice(-6)).toEqual([20, 19, 18, 17, 16, 15]);
    expect(controller.snapshot().nextCursor).toBeNull();
  });

  it("a failed older page keeps the list and offers retry", async () => {
    const { horizon, controller } = setup();
    horizon.history.set(ME, desc(30, 1));
    await controller.start();
    horizon.failingHistory.add(ME);
    await controller.loadMore();
    expect(controller.snapshot()).toMatchObject({ more: "error", moreError: "NETWORK_ERROR" });
    expect(controller.snapshot().items).toHaveLength(20);
  });

  it("reads a merge amount from effects on demand", async () => {
    const { horizon, controller } = setup();
    horizon.history.set(ME, [rec(8, { type: "account_merge", account: PEER, into: ME })]);
    horizon.effects.set("8", [{ type: "account_credited", account: ME, amount: "12.5000000" }]);
    await controller.start();
    expect(controller.snapshot().items[0]!.amountStroops).toBeNull();
    await controller.loadMergeAmount("8");
    expect(controller.snapshot().items[0]!.amountStroops).toBe("125000000");
  });
});

function stub(id: number) {
  return {
    id: String(id),
    pagingToken: String(id),
    hash: `h${String(id)}`,
    at: "2026-10-14T10:00:00Z",
    direction: "in" as const,
    kind: "payment" as const,
    counterparty: PEER,
    amountStroops: "10000000",
    successful: true,
  };
}
