# NETWORK.md — Horizon client, network config, history

Code: `packages/core/src/network/` and `packages/core/src/history/`.

---

## 1. Network configuration

```ts
// core/network/config.ts
export type NetworkId = "testnet" | "mainnet";

export interface NetworkConfig {
  id: NetworkId;
  label: string;                 // "Testnet" | "Mainnet"
  passphrase: string;
  horizonUrl: string;            // default, overridable in settings
  friendbotUrl?: string;         // testnet only
  explorerTxUrl: (hash: string) => string;
  explorerAccountUrl: (id: string) => string;
}

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  testnet: {
    id: "testnet",
    label: "Testnet",
    passphrase: "Test SDF Network ; September 2015",
    horizonUrl: "https://horizon-testnet.stellar.org",
    friendbotUrl: "https://friendbot.stellar.org",
    explorerTxUrl: (h) => `https://stellar.expert/explorer/testnet/tx/${h}`,
    explorerAccountUrl: (a) => `https://stellar.expert/explorer/testnet/account/${a}`,
  },
  mainnet: {
    id: "mainnet",
    label: "Mainnet",
    passphrase: "Public Global Stellar Network ; September 2015",
    horizonUrl: "https://horizon.stellar.org",
    explorerTxUrl: (h) => `https://stellar.expert/explorer/public/tx/${h}`,
    explorerAccountUrl: (a) => `https://stellar.expert/explorer/public/account/${a}`,
  },
};
```

- `settings.horizonOverrides[networkId]` replaces `horizonUrl` when set. Validate: must be `https://` (allow `http://localhost` only in dev builds). On save, probe `GET /` and check the returned `network_passphrase` equals the network's passphrase; reject the override otherwise. This catches pointing "mainnet" at a testnet Horizon.
- Before the M1 milestone closes, check the current status of SDF's public Horizon (SDF has been steering ecosystem services toward Stellar RPC). The `HorizonClient` interface (§2) exists so the backend can be swapped without touching callers.

## 2. `HorizonClient` interface

```ts
export interface HorizonClient {
  getRoot(): Promise<HorizonRoot>;                                    // GET /
  getLatestLedger(): Promise<LedgerRecord>;                           // GET /ledgers?order=desc&limit=1
  getAccount(id: string): Promise<AccountRecord | null>;              // GET /accounts/{id}  (404 → null)
  getFeeStats(): Promise<FeeStats>;                                   // GET /fee_stats
  submitTransaction(xdr: string): Promise<SubmitResponse>;            // POST /transactions
  getTransaction(hash: string): Promise<TransactionRecord | null>;    // GET /transactions/{hash} (404 → null)
  getPayments(id: string, opts: PageOpts): Promise<Page<OperationRecord>>; // GET /accounts/{id}/payments
  getOperationEffects(opId: string): Promise<EffectRecord[]>;         // for account_merge amounts
  streamPayments(id: string, cursor: string, onRecord: (r: OperationRecord) => void): () => void; // SSE; returns unsubscribe
}
```

Implementation `createHorizonClient(baseUrl, platform)`:

- Uses `platform.fetch` (injectable).
- Every JSON response is parsed with a **zod schema that covers only the fields we use**, using `.passthrough()` so new Horizon fields don't break us. Parse failures → `HORIZON_BAD_RESPONSE`.
- `Accept: application/json` header. No custom headers that would trigger unneeded CORS preflights.
- Timeouts via `AbortController`: 10 s for reads, 35 s for submit (Horizon's own submit timeout is ~30 s and returns 504).

## 3. Error and retry policy

| Situation | Policy |
|---|---|
| Read: network error / 5xx | Retry up to 3 times with backoff 500 ms, 1 s, 2 s + jitter. Then `NETWORK_ERROR` (retryable). |
| Read: 429 | Honor `Retry-After` if ≤ 10 s, else surface `RATE_LIMITED`. |
| Read: 404 on account / transaction | Not an error — return `null`. |
| Read: 404 elsewhere | `HORIZON_NOT_FOUND`. |
| Submit: anything | **No automatic retry of a rebuilt tx.** Return raw outcome to the resolver (TRANSACTIONS §5). |

The public SDF Horizon instances are rate-limited per IP. The popup must not poll aggressively (see §6).

## 4. Response shapes we depend on

### `GET /accounts/{id}` (subset)

```ts
{
  id: string;
  sequence: string;                   // int64 as string
  subentry_count: number;
  num_sponsoring?: number;            // may be absent → 0
  num_sponsored?: number;             // may be absent → 0
  thresholds: { low_threshold: number; med_threshold: number; high_threshold: number };
  signers: { key: string; weight: number; type: string }[];
  balances: (
    | { asset_type: "native"; balance: string; selling_liabilities: string; buying_liabilities: string }
    | { asset_type: string; /* non-native, ignored in MVP */ }
  )[];
  data: Record<string, string>;       // base64 values (SEP-29 lives here)
}
```

Default (supported) signer setup: exactly one signer (the account key, weight 1) and all thresholds 0 — or thresholds ≤ 1 with the single signer. Anything else → multisig unsupported.

### `GET /fee_stats` (subset)

```ts
{
  last_ledger_base_fee: string;
  ledger_capacity_usage: string;
  fee_charged: { p10: string; p50: string; p70: string; p90: string; p99: string; mode: string; /* … */ };
  max_fee:     { /* same percentile keys */ };
}
```

### `POST /transactions`

- 200 → `{ hash, ledger, successful, envelope_xdr, result_xdr, ... }`
- 400 → `{ type, title, status: 400, extras: { result_codes: { transaction, operations? }, envelope_xdr, result_xdr } }`
- 504 → timeout problem document.

### `GET /accounts/{id}/payments`

Query: `order=desc&limit=20&cursor=<paging_token>&include_failed=false`. Response `_embedded.records[]`; each record has `id`, `paging_token`, `type`, `created_at`, `transaction_hash`, `transaction_successful`, plus type-specific fields. Use `_links.next` or the last record's `paging_token` as the next cursor.

For memos: payment records don't include the memo. Fetch via `?join=transactions`, which embeds the transaction (with `memo_type`, `memo`) in each record. Use `join=transactions` for the history list to avoid N+1 requests.

## 5. History normalization (`core/history/normalize.ts`)

Convert Horizon records into a UI-ready shape:

```ts
type HistoryItem = {
  id: string;                  // operation id
  pagingToken: string;
  hash: string;
  at: string;                  // ISO time
  direction: "in" | "out" | "self";
  kind: "payment" | "account_created" | "account_merged" | "other";
  counterparty: string;        // G or M
  amountStroops: string | null;// null if unknown (merge without effects fetched yet)
  memo?: { type: string; value: string };
  successful: boolean;
};
```

Rules:
- `payment` native: `direction = from === me ? "out" : "in"` (compare base accounts; handle `from_muxed`/`to_muxed`).
- `payment` non-native and path payments not delivering native: `kind: "other"`, hidden in MVP UI.
- `create_account`: `in` if `account === me` (counterparty = `funder`), `out` if `funder === me` (counterparty = `account`). Amount = `starting_balance`.
- `account_merge`: `in` if `into === me`, `out` if `account === me`. Amount: fetch effects lazily when the row is expanded.
- Amount strings → bigint stroops via `parseXlm`.

## 6. Refresh strategy (popup)

The SW can't hold a long-lived SSE connection (it gets terminated). So:

- On popup open: fetch account + first history page.
- While the popup is open: open an SSE stream on `/accounts/{id}/payments?cursor=now` (via `EventSource`); on each event, refetch the account and prepend the normalized item. Close the stream on popup unload.
- If SSE fails, fall back to polling the account every 15 s while the popup is visible.
- After a successful send: refetch account immediately.
- Never poll while the popup is closed in the MVP. (Background notifications for incoming payments are post-MVP and would need an alarm-driven poll — ADR first.)

## 7. Base reserve

On startup and when the network changes, `getLatestLedger()` → `base_reserve_in_stroops`. Cache per network for the session. Fallback 5,000,000 if unavailable (log the fallback). Used by the reserve math in STELLAR_PRIMER §4.

## 8. Privacy notes

- All requests go directly from the user's browser to the configured Horizon. Stellix has no proxy.
- Horizon operators can see the requesting IP and the account IDs queried. Mention in the privacy section of the store listing and the About screen.
- No third-party requests besides Horizon, Friendbot (testnet), and explorer links the user clicks.
