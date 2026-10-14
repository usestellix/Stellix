import type { z } from "zod";
import { StellixError } from "../errors.js";
import type { Platform } from "../platform.js";
import { randomInt } from "../random.js";
import {
  accountSchema,
  asyncSubmitSchema,
  feeStatsSchema,
  ledgerPageSchema,
  effectsPageSchema,
  historyPageSchema,
  historyRecordSchema,
  paymentsPageSchema,
  rootSchema,
  transactionSchema,
  type AccountRecord,
  type AsyncSubmitResponse,
  type EffectRecord,
  type HistoryRecord,
  type FeeStats,
  type HorizonRoot,
  type LedgerRecord,
  type PaymentRecord,
  type TransactionRecord,
} from "./horizon-schemas.js";

// HorizonClient (NETWORK.md §2–3). Streaming lives in the shell (EventSource is a platform API);
// it builds its URL with historyStreamUrl and parses events with parseHistoryRecord.

export const HISTORY_PAGE_SIZE = 20;

export interface HistoryPage {
  records: HistoryRecord[];
  /** paging_token of the last record; null once a short page shows the end. */
  nextCursor: string | null;
}

export interface HorizonClient {
  /** GET / */
  getRoot(): Promise<HorizonRoot>;
  /** GET /ledgers?order=desc&limit=1 */
  getLatestLedger(): Promise<LedgerRecord>;
  /** GET /accounts/{id}. 404 (unfunded) → null; that's a state, not an error. */
  getAccount(id: string): Promise<AccountRecord | null>;
  /** GET /fee_stats */
  getFeeStats(): Promise<FeeStats>;
  /**
   * POST /transactions_async (ADR 0007). Returns Horizon's tx_status. Never retried here.
   * Throws NETWORK_ERROR (retryable) when the outcome is unknown: transport error, timeout,
   * or a response without a valid status. The caller then resolves by hash.
   */
  submitTransactionAsync(envelopeXdr: string): Promise<AsyncSubmitResponse>;
  /** GET /transactions/{hash}. 404 → null (not ingested, or never will be). */
  getTransaction(hash: string): Promise<TransactionRecord | null>;
  /** GET /accounts/{id}/payments, newest first. Unfunded account (404) → []. */
  getPayments(id: string, limit: number): Promise<PaymentRecord[]>;
  /**
   * GET /accounts/{id}/payments?order=desc&include_failed=false&join=transactions (NETWORK §5),
   * from `cursor` (exclusive) when given. Unfunded account (404) → empty, end of list.
   */
  getHistoryPage(id: string, cursor?: string): Promise<HistoryPage>;
  /** GET /operations/{id}/effects (merge amounts). */
  getOperationEffects(operationId: string): Promise<EffectRecord[]>;
}

const HISTORY_QUERY = "include_failed=false&join=transactions";

/**
 * SSE URL for payments after `cursor` (NETWORK §6); the shell opens it with EventSource. The
 * popup passes the newest record it fetched, so nothing between that fetch and the stream
 * opening is missed; "now" when it has none.
 */
export function historyStreamUrl(baseUrl: string, id: string, cursor = "now"): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    `accounts/${encodeURIComponent(id)}/payments?cursor=${encodeURIComponent(cursor)}&${HISTORY_QUERY}`,
    base,
  ).toString();
}

/** Validates one streamed record (an SSE `message` event's JSON). Anything else → null. */
export function parseHistoryRecord(json: unknown): HistoryRecord | null {
  const parsed = historyRecordSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export interface HorizonClientOptions {
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
  /** Per-request timeout for reads (NETWORK.md §2: 10 s). */
  timeoutMs?: number;
}

const READ_TIMEOUT_MS = 10_000;
const BACKOFF_MS = [500, 1_000, 2_000] as const;
const JITTER_MS = 250;
const MAX_RETRY_AFTER_S = 10;

export function createHorizonClient(
  baseUrl: string,
  platform: Pick<Platform, "fetch">,
  options: HorizonClientOptions = {},
): HorizonClient {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const timeoutMs = options.timeoutMs ?? READ_TIMEOUT_MS;

  async function read<S extends z.ZodType>(
    path: string,
    schema: S,
    notFound: "null" | "error",
  ): Promise<z.output<S> | null> {
    const url = new URL(path, base).toString();
    for (let attempt = 0; ; attempt++) {
      const canRetry = attempt < BACKOFF_MS.length;
      const backoff = () => sleep((BACKOFF_MS[attempt] ?? 0) + randomInt(JITTER_MS));

      let res: Response;
      try {
        res = await fetchWithTimeout(platform.fetch, url, timeoutMs);
      } catch {
        if (canRetry) {
          await backoff();
          continue;
        }
        throw new StellixError("NETWORK_ERROR", "Horizon unreachable", true);
      }

      if (res.status === 404) {
        if (notFound === "null") return null;
        throw new StellixError("HORIZON_NOT_FOUND", "Horizon resource not found");
      }
      if (res.status === 429) {
        // Missing or HTTP-date Retry-After → surface the limit (Number(null) would be 0 and spin).
        const header = res.headers.get("Retry-After");
        const retryAfter = header === null || header.trim() === "" ? NaN : Number(header);
        if (
          canRetry &&
          Number.isFinite(retryAfter) &&
          retryAfter >= 0 &&
          retryAfter <= MAX_RETRY_AFTER_S
        ) {
          await sleep(retryAfter * 1_000);
          continue;
        }
        throw new StellixError("RATE_LIMITED", "Horizon rate limit", true);
      }
      if (res.status >= 500) {
        if (canRetry) {
          await backoff();
          continue;
        }
        throw new StellixError("NETWORK_ERROR", `Horizon error ${String(res.status)}`, true);
      }
      if (!res.ok) {
        throw new StellixError(
          "HORIZON_BAD_RESPONSE",
          `Unexpected Horizon status ${String(res.status)}`,
        );
      }

      let body: unknown;
      try {
        body = await res.json();
      } catch {
        throw new StellixError("HORIZON_BAD_RESPONSE", "Horizon returned invalid JSON");
      }
      const parsed = schema.safeParse(body);
      if (!parsed.success) {
        throw new StellixError("HORIZON_BAD_RESPONSE", `Unexpected Horizon response for ${path}`);
      }
      return parsed.data;
    }
  }

  const required = async <S extends z.ZodType>(path: string, schema: S): Promise<z.output<S>> => {
    const value = await read(path, schema, "error");
    if (value === null) throw new StellixError("HORIZON_NOT_FOUND", "Horizon resource not found");
    return value;
  };

  return {
    getRoot: () => required("", rootSchema),
    getLatestLedger: async () => {
      const page = await required("ledgers?order=desc&limit=1", ledgerPageSchema);
      const [latest] = page._embedded.records;
      if (latest === undefined) throw new StellixError("HORIZON_BAD_RESPONSE", "No ledgers");
      return latest;
    },
    getAccount: (id) => read(`accounts/${encodeURIComponent(id)}`, accountSchema, "null"),
    getFeeStats: () => required("fee_stats", feeStatsSchema),
    getTransaction: (hash) =>
      read(`transactions/${encodeURIComponent(hash)}`, transactionSchema, "null"),
    getPayments: async (id, limit) => {
      const page = await read(
        `accounts/${encodeURIComponent(id)}/payments?order=desc&limit=${String(Math.min(Math.max(limit, 1), 200))}`,
        paymentsPageSchema,
        "null",
      );
      return page?._embedded.records ?? [];
    },
    getHistoryPage: async (id, cursor) => {
      const from = cursor === undefined ? "" : `&cursor=${encodeURIComponent(cursor)}`;
      const page = await read(
        `accounts/${encodeURIComponent(id)}/payments?order=desc&limit=${String(HISTORY_PAGE_SIZE)}&${HISTORY_QUERY}${from}`,
        historyPageSchema,
        "null",
      );
      const records = page?._embedded.records ?? [];
      const last = records.at(-1);
      return {
        records,
        nextCursor:
          records.length === HISTORY_PAGE_SIZE && last !== undefined ? last.paging_token : null,
      };
    },
    getOperationEffects: async (operationId) =>
      (
        await required(
          `operations/${encodeURIComponent(operationId)}/effects?limit=50`,
          effectsPageSchema,
        )
      )._embedded.records,
    submitTransactionAsync: async (envelopeXdr) => {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort();
      }, timeoutMs);
      let res: Response;
      try {
        res = await platform.fetch(new URL("transactions_async", base).toString(), {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ tx: envelopeXdr }).toString(),
          signal: controller.signal,
        });
      } catch {
        throw new StellixError("NETWORK_ERROR", "Submit outcome unknown", true);
      } finally {
        clearTimeout(timer);
      }
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        throw new StellixError(
          "NETWORK_ERROR",
          `Submit returned ${String(res.status)} without a status`,
          true,
        );
      }
      const parsed = asyncSubmitSchema.safeParse(body);
      if (!parsed.success) {
        throw new StellixError(
          "NETWORK_ERROR",
          `Submit returned ${String(res.status)} without a status`,
          true,
        );
      }
      return parsed.data;
    },
  };
}

/** Plain GET with only `Accept`, so CORS stays a simple request (no preflight). */
async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    return await fetchFn(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
