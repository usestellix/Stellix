import {
  applyFirstPage,
  isStellixError,
  mergeAmountFromEffects,
  mergeHistoryItems,
  normalizeHistory,
  normalizeHistoryRecord,
  type ErrorCode,
  type HistoryItem,
  type HistoryList,
  type HorizonClient,
  type KeyValueStore,
  type NetworkId,
} from "@stellix/core";
import { readHistoryCache, writeHistoryCache } from "./history-cache.js";
import { openHistoryStream, type EventSourceCtor } from "./history-stream.js";

// History while the popup is open (NETWORK §6, UI_FLOWS §7). Plain object, no React, so the
// ordering rules are unit-testable:
// 1. render the cached first pages, if any;
// 2. ALWAYS refetch page 1 and fold it in by operation id (payments that arrived while the
//    popup was closed appear; a gap drops the cache, see applyFirstPage);
// 3. then stream from the newest fetched record (so nothing between 2 and 3 is lost), or poll
//    page 1 every 15 s while the popup is visible if the stream can't stay open.
// Nothing runs once stop() is called; the popup closing ends everything. start() after stop()
// begins a fresh run.

export const HISTORY_POLL_MS = 15_000;
/** Pages fetched in a row when a page holds only hidden (non-XLM) records. */
const MAX_EMPTY_PAGES = 5;

export interface HistorySnapshot {
  /** First page: loading until cache or network answers; error only with nothing to show. */
  phase: "loading" | "ready" | "error";
  items: readonly HistoryItem[];
  nextCursor: string | null;
  error: ErrorCode | null;
  more: "idle" | "loading" | "error";
  moreError: ErrorCode | null;
  live: "off" | "stream" | "polling";
  /** Bumps whenever a new item arrives (stream or poll): the balance refetches on it. */
  activity: number;
}

export interface HistoryControllerOptions {
  me: string;
  network: NetworkId;
  horizon: HorizonClient;
  streamUrl: (cursor: string) => string;
  store: KeyValueStore;
  EventSource?: EventSourceCtor | undefined;
  isVisible?: () => boolean;
  setInterval?: (fn: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
}

export interface HistoryController {
  snapshot: () => HistorySnapshot;
  subscribe: (listener: () => void) => () => void;
  start(): Promise<void>;
  stop(): void;
  /** Page 1 again (Retry, after a send). */
  refresh(): Promise<void>;
  loadMore(): Promise<void>;
  /** Merge rows have no amount on the record; read it from the operation's effects. */
  loadMergeAmount(id: string): Promise<void>;
}

const codeOf = (err: unknown): ErrorCode => (isStellixError(err) ? err.code : "INTERNAL_ERROR");

export function createHistoryController(options: HistoryControllerOptions): HistoryController {
  const { me, network, horizon, store } = options;
  const isVisible = options.isVisible ?? (() => true);
  const startTimer = options.setInterval ?? ((fn, ms) => globalThis.setInterval(fn, ms));
  const stopTimer =
    options.clearInterval ??
    ((h) => {
      globalThis.clearInterval(h as ReturnType<typeof setInterval>);
    });

  let state: HistorySnapshot = {
    phase: "loading",
    items: [],
    nextCursor: null,
    error: null,
    more: "idle",
    moreError: null,
    live: "off",
    activity: 0,
  };
  const listeners = new Set<() => void>();
  // One token per start(); stop() switches it off. Async work captures the token it began
  // with, so results from a stopped run are dropped even after a restart (React StrictMode
  // runs effects twice in development).
  let life = { on: false };
  /** Read through a call: TS would otherwise keep a pre-await narrowing of `run.on`. */
  const alive = (run: { on: boolean }) => run.on;
  let closeStream: (() => void) | null = null;
  let poll: unknown = null;

  const set = (run: { on: boolean }, patch: Partial<HistorySnapshot>) => {
    if (!run.on) return;
    state = { ...state, ...patch };
    for (const l of listeners) l();
  };
  const list = (): HistoryList => ({ items: [...state.items], nextCursor: state.nextCursor });
  const persist = () => {
    void writeHistoryCache(store, network, me, list()).catch(() => undefined);
  };

  /** Fetch page 1 and fold it in. Returns the newest raw paging token (the stream cursor). */
  const fetchFirstPage = async (
    run: { on: boolean },
    countActivity: boolean,
  ): Promise<string | null> => {
    const page = await horizon.getHistoryPage(me);
    if (!run.on) return null;
    const fresh = normalizeHistory(page.records, me);
    const next = applyFirstPage(state.phase === "ready" ? list() : null, fresh, page.nextCursor);
    const known = new Set(state.items.map((i) => i.id));
    const arrived = next.items.some((i) => !known.has(i.id));
    set(run, {
      items: next.items,
      nextCursor: next.nextCursor,
      phase: "ready",
      error: null,
      ...(countActivity && arrived ? { activity: state.activity + 1 } : {}),
    });
    persist();
    return page.records[0]?.paging_token ?? null;
  };

  const startPolling = (run: { on: boolean }) => {
    if (!run.on || poll !== null) return;
    set(run, { live: "polling" });
    poll = startTimer(() => {
      if (!run.on || !isVisible()) return;
      void fetchFirstPage(run, true).catch(() => undefined); // keep showing what we have
    }, HISTORY_POLL_MS);
  };

  const startStream = (run: { on: boolean }, cursor: string) => {
    if (!run.on) return;
    set(run, { live: "stream" });
    closeStream = openHistoryStream(
      options.streamUrl(cursor),
      (record) => {
        const item = normalizeHistoryRecord(record, me);
        if (!run.on || item === null || state.items.some((i) => i.id === item.id)) return;
        set(run, {
          items: mergeHistoryItems(state.items, [item]),
          phase: "ready",
          activity: state.activity + 1,
        });
        persist();
      },
      () => {
        closeStream = null;
        startPolling(run);
      },
      options.EventSource,
    );
  };

  return {
    snapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async start() {
      life.on = false;
      const run = { on: true };
      life = run;
      const cached = await readHistoryCache(store, network, me).catch(() => null);
      if (!run.on) return;
      if (cached !== null)
        set(run, { phase: "ready", items: cached.items, nextCursor: cached.nextCursor });
      try {
        const newest = await fetchFirstPage(run, false);
        startStream(run, newest ?? "now");
      } catch (err: unknown) {
        // Cached rows stay visible; with nothing to show, the list shows the error + Retry.
        set(run, state.phase === "ready" ? {} : { phase: "error", error: codeOf(err) });
        startPolling(run);
      }
    },
    stop() {
      life.on = false;
      closeStream?.();
      closeStream = null;
      if (poll !== null) stopTimer(poll);
      poll = null;
    },
    async refresh() {
      const run = life;
      if (state.phase === "error") set(run, { phase: "loading", error: null });
      try {
        await fetchFirstPage(run, true);
      } catch (err: unknown) {
        set(run, state.phase === "ready" ? {} : { phase: "error", error: codeOf(err) });
      }
    },
    async loadMore() {
      const run = life;
      let cursor = state.nextCursor;
      if (!run.on || state.more === "loading" || cursor === null || state.phase !== "ready") return;
      set(run, { more: "loading", moreError: null });
      try {
        for (let i = 0; i < MAX_EMPTY_PAGES && cursor !== null; i++) {
          const page = await horizon.getHistoryPage(me, cursor);
          if (!alive(run)) return; // stopped while waiting
          const fresh = normalizeHistory(page.records, me);
          cursor = page.nextCursor;
          set(run, { items: mergeHistoryItems(state.items, fresh), nextCursor: cursor });
          if (fresh.length > 0) break; // otherwise the page was all hidden records: keep going
        }
        set(run, { more: "idle" });
        persist();
      } catch (err: unknown) {
        set(run, { more: "error", moreError: codeOf(err) });
      }
    },
    async loadMergeAmount(id) {
      const run = life;
      const item = state.items.find((i) => i.id === id);
      if (item?.kind !== "account_merged" || item.amountStroops !== null) return;
      const effects = await horizon.getOperationEffects(id);
      const amountStroops = mergeAmountFromEffects(effects, me, item.direction);
      if (amountStroops === null || !run.on) return;
      set(run, { items: state.items.map((i) => (i.id === id ? { ...i, amountStroops } : i)) });
      persist();
    },
  };
}
