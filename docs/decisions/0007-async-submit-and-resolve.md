# 0007 — Async submit and resolve-by-hash

- Status: Accepted
- Date: 2026-10-14

## Context
TRANSACTIONS §5 specified Horizon's synchronous submit (`POST /transactions`, which waits for ledger inclusion, up to ~30 s, then 504), with a 35 s client timeout (NETWORK §2).

Chrome terminates an MV3 service worker "when a `fetch()` response takes more than 30 seconds to arrive", and after 30 s without events or extension API calls ([lifecycle docs](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)). A slow synchronous submit could kill the worker mid-submit, the most ambiguous moment there is.

Verified against live testnet Horizon v29 on 2026-10-14:
- `POST /transactions_async` returns immediately: `201 {tx_status: "PENDING", hash}`. Resubmitting the same envelope also returns `PENDING` with the same hash.
- A rejection is `400 {tx_status: "ERROR", error_result_xdr}`. Only XDR, no readable codes.
- SDF's reference also documents `409` (duplicate), `500`, and `503` (core unavailable).
- A transaction that fails inside a ledger appears through `GET /transactions/{hash}` as `successful: false` with `result_xdr`.
- SDK 17 decodes result XDR. Its JSON form uses Horizon's snake_case names (`tx_bad_seq`, `{op_inner: {payment: "no_destination"}}`). Its in-memory unions are internal, so decoding goes through JSON.
- Resubmitting the same signed XDR after it succeeded is idempotent.

## Decision
- **Submit with `POST /transactions_async`, 10 s client timeout.** Then resolve by polling `GET /transactions/{hash}` (2/3/5 s backoff).
- **`tx_status` handling:**
  - `PENDING`, `DUPLICATE` → accepted; resolve.
  - `TRY_AGAIN_LATER` → not accepted; resubmit the **same** signed XDR, at most every 2 s, only while `now < maxTime`.
  - `ERROR` → decode `error_result_xdr` and map (TRANSACTIONS §8).
  - Transport error, timeout, or a response without a valid status → outcome unknown; resolve, and resubmit the same XDR if it was never accepted.
- **A 404 is definitive only after `maxTime + 15 s`** → `TX_EXPIRED_NOT_INCLUDED` (safe to rebuild). Network errors are never definitive.
- **`CONFIRM_PAYMENT` returns within ~20 s.** That's `success` / `failed` / `rebuild` if known, else `{status: "pending", hash}`.
- **The signed envelope is kept in `chrome.storage.session` as `inflight:<hash>` until the outcome is known,** so a restarted worker can resubmit the same XDR.
  - It survives lock: resolving needs no secrets.
  - Reset clears it.
  - It's dropped once the outcome is known.
  - Finished outcomes stay for the popup (`DISMISS_OUTCOME`) or 30 min.
- **Resolution keeps going without the popup:**
  - on every worker start
  - on a 30 s `resolve` alarm while anything is unfinished
  - when the popup polls `GET_STATUS`

  Each poll writes session storage, an extension API call that resets the idle timer.
- **Double-send guards:**
  - `CONFIRM` consumes the prepared tx **before** signing, inside the SW serial queue.
  - `PREPARE` refuses with `TX_IN_FLIGHT` while the account has an unresolved transaction.
  - A rebuilt transaction is always a new review.

## Consequences
- No request outlives Chrome's limits; the longest is the 10 s submit.
- One resolution path covers fresh submits, ambiguous submits, and worker restarts.
- Result codes come from XDR, pinned by captured fixtures (`submit-async-bad-seq`, `transaction-failed`).
- A signed authorization sits in session storage for up to `maxTime + 15 s`. It's trusted contexts only and never logged.

## Alternatives considered
- **Synchronous submit with a client timeout under 30 s:** rejected. A 504 or timeout is the common slow case, so it lands in resolve-by-hash anyway, with less information.
- **Offscreen document or long-lived port to keep the worker alive:** rejected. It needs extra manifest surface (an `offscreen` permission or open UI), and survival still isn't guaranteed.
