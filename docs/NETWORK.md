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
- Horizon status was checked on 2026-10-14. It's end-of-life but maintained, and it's still the only SDF API with per-account history. See ADR 0006. The `HorizonClient` interface (§2) exists so the backend can be swapped without touching callers.

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
  getOrderBook(selling: AssetRef, buying: AssetRef): Promise<OrderBook>; // GET /order_book?…&limit=1 (Shield OFFER_BAD_PRICE)
  streamPayments(id: string, cursor: string, onRecord: (r: OperationRecord) => void): () => void; // SSE; returns unsubscribe
}
```

Implementation `createHorizonClient(baseUrl, platform)`:

- Uses `platform.fetch` (injectable).
- Every JSON response is parsed with a **zod schema that covers only the fields we use**, using `.passthrough()` so new Horizon fields don't break us. Parse failures → `HORIZON_BAD_RESPONSE`.
- `Accept: application/json` header. No custom headers that would trigger unneeded CORS preflights.
- Timeouts via `AbortController`: 10 s for reads and for the async submit. No request may approach Chrome's 30 s fetch limit for service workers (ADR 0007).

## 3. Error and retry policy

| Situation | Policy |
|---|---|
| Read: network error / 5xx | Retry up to 3 times with backoff 500 ms, 1 s, 2 s + jitter. Then `NETWORK_ERROR` (retryable). |
| Read: 429 | Honor `Retry-After` if ≤ 10 s, else surface `RATE_LIMITED`. |
| Read: 404 on account / transaction | Not an error — return `null`. |
| Read: 404 elsewhere | `HORIZON_NOT_FOUND`. |
| Submit: anything | Never retried by the client. The send service may resubmit the **same** signed XDR (TRANSACTIONS §5); a rebuilt tx is never resubmitted. |

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

Source: `GET /accounts/{id}/payments?order=desc&limit=20&include_failed=false&join=transactions`, paged by the last record's `paging_token` (`HorizonClient.getHistoryPage`). Failed transactions are excluded in the MVP. An unfunded account (404) is an empty list. Shapes are pinned by captured fixtures (`history-page`, `history-multiop-page1/2`, `effects-account-merge`).

Convert Horizon records into a UI-ready shape:

```ts
type HistoryItem = {
  id: string;                  // operation id (numeric; orders merged lists)
  pagingToken: string;
  hash: string;
  at: string;                  // ISO time
  direction: "in" | "out" | "self";
  kind: "payment" | "account_created" | "account_merged";
  counterparty: string;        // G or M, as used on chain
  amountStroops: string | null;// null for a merge until its effects are read
  memo?: { type: "text" | "id" | "hash" | "return"; value: string };
  muxedId?: string;            // recipient ID when paid to our M address
  successful: boolean;
  fee?: { stroops: string; operationCount: number }; // only when fee_account === me
};
```

Rules:
- Directions compare **base** accounts. Horizon reports `from`/`to` as `G` and adds `from_muxed`/`to_muxed`/`to_muxed_id`; the counterparty keeps the muxed form.
- `payment` native: `out` if `from === me`, `in` if `to === me`, `self` if both.
- Path payments: shown only when XLM moves on our side. Outgoing paid in XLM → amount = `source_amount`. Incoming delivering XLM → amount = `amount`.
- Everything else (non-native payments, path payments without XLM on our side, other operation types) normalizes to `null` and is hidden in the MVP.
- `create_account`: `in` if `account === me` (counterparty = `funder`), `out` if `funder === me` (counterparty = `account`). Amount = `starting_balance`. An incoming `create_account` is the account's origin (end-of-list copy, UI_FLOWS §7).
- `account_merge`: `in` if `into === me`, `out` if `account === me`. Amount: `GET /operations/{id}/effects` when the row is opened; `account_credited` (in) or `account_debited` (out) for our account.
- **Fee:** `transaction.fee_charged` is the whole transaction's fee. It's attached only when `transaction.fee_account` is this account, never merely because the item is outgoing. A multi-op transaction carries the same fee on each of its items, so the UI shows it only in the detail sheet (UI_FLOWS §7).
- Amount strings → bigint stroops via `parseHorizonAmount`.
- Merging pages, cached items and streamed items: dedupe by operation id, newest first; fresh records win, except a merge amount already loaded is kept (`mergeHistoryItems`).

## 6. Refresh strategy (popup)

The SW can't hold a long-lived SSE connection (it gets terminated). So the popup owns it (`ui/lib/history-controller.ts`):

- On popup open: fetch the account, and render cached history pages (`ui:history:<network>:<account>` in `chrome.storage.session`, first 60 items) if any.
- **Always** refetch history page 1 and merge it by operation id, so payments that arrived while the popup was closed appear. If the fresh page doesn't reach the cached range (more than a page arrived meanwhile), the cache is dropped rather than leaving a silent gap (`applyFirstPage`).
- Then open an SSE stream on `/accounts/{id}/payments?cursor=<newest fetched paging token>&include_failed=false&join=transactions` (via `EventSource`; `cursor=now` only when there's no history yet). Starting from the newest fetched record rather than `now` means nothing between the fetch and the stream opening is lost; duplicates are dropped by id. On each new item, refetch the account. Close the stream on popup unload.
- The browser reconnects a dropped stream by itself (Horizon's `id:` is the paging token, so `Last-Event-ID` resumes it). If the stream is closed for good (for example 404 for an unfunded account), fall back to polling page 1 every 15 s while the popup is visible; a new item refetches the account, which is how an unfunded account's activation shows up.
- After a successful send: refetch account and history page 1 immediately.
- Never poll while the popup is closed in the MVP. (Background notifications for incoming payments are post-MVP and would need an alarm-driven poll — ADR first.)

## 7. Base reserve

On startup and when the network changes, `getLatestLedger()` → `base_reserve_in_stroops`. Cache per network for the session. Fallback 5,000,000 if unavailable (log the fallback). Used by the reserve math in STELLAR_PRIMER §4.

## 8. Privacy notes

- All requests go directly from the user's browser to the configured Horizon. Stellix has no proxy.
- Horizon operators can see the requesting IP and the account IDs queried. This is stated in `PRIVACY.md` (which names the operator), the store listing and privacy tab (`docs/store/`), and the About screen. The service worker also contacts Horizon in the background while a submitted payment is confirming (ADR 0007), including while locked.
- No third-party requests besides Horizon, Friendbot (testnet), and explorer links the user clicks.
