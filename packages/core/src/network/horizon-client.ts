import type { z } from "zod";
import { StellixError } from "../errors.js";
import type { Platform } from "../platform.js";
import { randomInt } from "../random.js";
import {
  accountSchema,
  feeStatsSchema,
  ledgerPageSchema,
  rootSchema,
  type AccountRecord,
  type FeeStats,
  type HorizonRoot,
  type LedgerRecord,
} from "./horizon-schemas.js";

// HorizonClient (NETWORK.md §2–3). M2 implements the read methods; submit, transactions,
// payments and streaming arrive with M3/M4 behind the same interface.

export interface HorizonClient {
  /** GET / */
  getRoot(): Promise<HorizonRoot>;
  /** GET /ledgers?order=desc&limit=1 */
  getLatestLedger(): Promise<LedgerRecord>;
  /** GET /accounts/{id}. 404 (unfunded) → null; that's a state, not an error. */
  getAccount(id: string): Promise<AccountRecord | null>;
  /** GET /fee_stats */
  getFeeStats(): Promise<FeeStats>;
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
