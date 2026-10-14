import type { HorizonClient } from "../network/horizon-client.js";
import { decodeResultXdr, type ResultCodes } from "./result-codes.js";

// Resolve by hash (TRANSACTIONS §5). After maxTime the network can never include the transaction,
// so a 404 past maxTime + 15 s (ledger close + ingestion lag) is definitive. A network error is
// never definitive: keep polling, the deadline doesn't move.

export const RESOLVE_GRACE_MS = 15_000;
export const RESOLVE_BACKOFF_MS = [2_000, 3_000, 5_000] as const;

export type ResolveState =
  | { kind: "success"; ledger: number }
  | { kind: "failed"; codes: ResultCodes }
  | { kind: "expired" }
  | { kind: "pending" };

export async function pollOnce(
  horizon: HorizonClient,
  hash: string,
  maxTimeSeconds: number,
  nowMs: number,
): Promise<ResolveState> {
  let record;
  try {
    record = await horizon.getTransaction(hash);
  } catch {
    return { kind: "pending" };
  }
  if (record !== null) {
    return record.successful
      ? { kind: "success", ledger: record.ledger }
      : { kind: "failed", codes: decodeResultXdr(record.result_xdr) };
  }
  return nowMs > maxTimeSeconds * 1000 + RESOLVE_GRACE_MS
    ? { kind: "expired" }
    : { kind: "pending" };
}

export interface ResolveOptions {
  horizon: HorizonClient;
  hash: string;
  maxTimeSeconds: number;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Stop and return "pending" once this much time has passed. */
  budgetMs: number;
  /** Called before each poll: persist progress (also keeps the MV3 worker alive). */
  onPoll?: (attempt: number) => Promise<void>;
  /** Called while still pending: e.g. resubmit the SAME signed XDR if Horizon never accepted it. */
  whilePending?: () => Promise<void>;
}

export async function resolveTransaction(opts: ResolveOptions): Promise<ResolveState> {
  const start = opts.now();
  for (let attempt = 0; ; attempt++) {
    await opts.onPoll?.(attempt);
    const state = await pollOnce(opts.horizon, opts.hash, opts.maxTimeSeconds, opts.now());
    if (state.kind !== "pending") return state;
    await opts.whilePending?.();
    const wait = RESOLVE_BACKOFF_MS[Math.min(attempt, RESOLVE_BACKOFF_MS.length - 1)] ?? 5_000;
    if (opts.now() - start + wait > opts.budgetMs) return { kind: "pending" };
    await opts.sleep(wait);
  }
}
