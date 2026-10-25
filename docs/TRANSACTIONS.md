# TRANSACTIONS.md — Building, signing, submitting, resolving

Covers the send flow end to end. Code lives in `packages/core/src/tx/` (pure logic) and is orchestrated by the service worker's `PREPARE_PAYMENT` / `CONFIRM_PAYMENT` handlers. Read `STELLAR_PRIMER.md` first.

---

## 1. Send state machine

```
            ┌──────────┐
            │  INPUT   │  popup: destination, amount, memo
            └────┬─────┘
                 │ PREPARE_PAYMENT
            ┌────▼─────┐   validation / resolution error
            │ PREPARING├──────────────────────────────► INPUT (with field error)
            └────┬─────┘
                 │ summary returned
            ┌────▼─────┐   user cancels / expires
            │  REVIEW  ├──────────────────────────────► INPUT (CANCEL_PAYMENT)
            └────┬─────┘
                 │ CONFIRM_PAYMENT
            ┌────▼──────┐
            │ SUBMITTING│
            └────┬──────┘
       ┌─────────┼──────────────┬─────────────────┐
       ▼         ▼              ▼                 ▼
   SUCCESS    FAILED       RESOLVING          REBUILD_NEEDED
  (hash)   (mapped err)  (ambiguous; polls   (tx_bad_seq / expired:
                          by hash until       back to PREPARING with
                          SUCCESS or FAILED)  same inputs, new review)
```

The popup renders states; the SW owns transitions that involve the network or secrets.

## 2. Input validation (`core/tx/validate.ts`)

Run in the popup for instant feedback **and again in the SW** (the SW never trusts the UI).

| Field | Rule | Error code |
|---|---|---|
| destination | trimmed; valid `G...` or `M...` via StrKey | `INVALID_ADDRESS` |
| destination | is an `S...` seed | `SECRET_KEY_ENTERED` |
| destination | equals source account (`G`) or its muxed form | `SELF_PAYMENT` |
| amount | parses via `parseXlm`, > 0, ≤ 7 decimals | `INVALID_AMOUNT` |
| memo (text) | ≤ 28 UTF-8 bytes | `MEMO_TOO_LONG` |
| memo (id) | integer string, 0 ≤ n < 2⁶⁴ | `INVALID_MEMO_ID` |
| memo + M address | both present | `MEMO_WITH_MUXED` (warn and block: the M address already carries the ID; a memo is almost always a mistake) |

## 3. Preparation (`PREPARE_PAYMENT`)

Executed in order. Any failure returns a mapped error and nothing is stored.

1. **Require unlocked** (session key present). Else `LOCKED`.
2. **Validate inputs** (§2).
3. **Load source account**: `GET /accounts/{source}`.
   - 404 → `SOURCE_UNFUNDED`.
   - Multisig / thresholds above default → `MULTISIG_UNSUPPORTED`.
4. **Resolve destination**:
   - Base account = destination if `G`, else decoded base of `M`.
   - `GET /accounts/{base}`: 200 → exists; 404 → doesn't exist; other → `NETWORK_ERROR` (retryable).
   - Decide op per STELLAR_PRIMER §2 decision table. `M` + not exists → `MUXED_DESTINATION_UNFUNDED`.
   - SEP-29 isn't checked here: Shield's `MEMO_REQUIRED` rule checks the built transaction (step 9).
5. **Fee**: `GET /fee_stats` → fee policy in STELLAR_PRIMER §5.2. On failure, use `last known` fee for this network if under 5 minutes old, else 100 × 10 = 1,000 stroops and mark `feeEstimated: true` in the summary.
6. **Balance checks** (all bigint stroops):
   - `available = balance − minimumBalance − sellingLiabilities` (STELLAR_PRIMER §4).
   - `amount + fee ≤ available` else `INSUFFICIENT_BALANCE` (include `maxSendable` in the error details so the UI can offer it).
   - If `createAccount`: `amount ≥ 2 × baseReserve` else `BELOW_MIN_STARTING_BALANCE`.
7. **Build**:
   ```ts
   new TransactionBuilder(sourceAccount, { fee: String(fee), networkPassphrase })
     .addOperation(op)           // Operation.payment({ destination, asset: Asset.native(), amount }) or Operation.createAccount({ destination, startingBalance })
     .addMemo(memo)              // Memo.text / Memo.id / Memo.none
     .setTimeout(180)
     .build();
   ```
8. **Summarize from the built tx** (`core/tx/summary.ts`): decode `tx.operations[0]`, `tx.memo`, `tx.fee`, `tx.timeBounds`, `tx.networkPassphrase`, `tx.source`. Assert exactly one op of an allowed type and source = active account. Produce:
   ```ts
   type PaymentSummary = {
     kind: "payment" | "createAccount";
     source: string;            // G...
     destination: string;       // as entered (G or M)
     destinationBase: string;   // G...
     amountStroops: string;     // bigint as string for messaging
     feeStroops: string;
     totalStroops: string;      // amount + fee
     memo: { type: "none" | "text" | "id"; value?: string };
     network: "testnet" | "mainnet";
     expiresAt: number;         // maxTime * 1000
     firstTimeDestination: boolean;
     feeEstimated: boolean;
   };
   ```
9. **Analyze** (Shield Mode A, SHIELD §2, §5): `analyze` runs on the built transaction with origin `stellix`. It reuses the source and destination records from steps 3–4, so it adds no Horizon request, and it has no `stellar.toml` source (`NO_TOML`): Stellix builds no `changeTrust`. If `evaluate` blocks: a `MEMO_REQUIRED` finding (SEP-29: destination `G`, no memo, `data["config.memo_required"]` base64-decodes to `"1"`) → `MEMO_REQUIRED`; a memo check that couldn't run → `NETWORK_ERROR` (retryable); any other block → `SHIELD_BLOCKED`. Nothing is stored.
10. **Store** `preparedTx:<uuid>` = `{ xdr: tx.toXDR(), networkId, summary, expiresAt, accountIndex, report }` in session storage. `report` is the analysis without its decoded request (bigints can't be stored), which is decoded again from `xdr` at confirm.
11. Return `{ preparedId, summary, expiresAt, report }`, where `report` is a `ReportView`: public data, no decoded request. Its `decision` is for display only; confirm re-evaluates the stored report.

`firstTimeDestination`: true if the destination doesn't appear in the account's last 200 history records (fetched lazily; if that fetch fails, default to `true`).

## 4. Confirmation (`CONFIRM_PAYMENT`)

1. Require unlocked. Steps 2–7 run inside the SW serial queue.
2. Load `preparedTx:<id>`. Missing → `PREPARED_TX_NOT_FOUND`. **Delete it immediately**, before signing: a second confirm for the same id can never sign again. Then, if `now ≥ expiresAt − 10s` (safety margin) → `PREPARED_TX_EXPIRED`.
3. Rehydrate: `TransactionBuilder.fromXDR(xdr, passphrase)`. Assert `networkId` equals the current network; else `NETWORK_MISMATCH`.
4. **Shield**: `assertSignable` on the stored `xdr` and the stored `report` (SHIELD §4 lists its checks and errors). A prepared tx without a report → `SHIELD_REPORT_EXPIRED`. Until the Review screen shows findings (#36), no confirmation is recorded, so a `review` decision fails with `SHIELD_CONFIRMATION_REQUIRED`; only `ready` signs. Then re-run the summary assertions on the rehydrated tx (defense in depth).
5. Derive keypair for `accountIndex` (KEY_MANAGEMENT §6), assert `keypair.publicKey() === tx.source`, sign, zero secrets.
6. Compute `hash = tx.hash().toString("hex")` before submitting. Persist `{ hash, maxTime }` in session as `inflight:<hash>` (so a SW restart mid-submit can still resolve it).
7. Submit (§5).
8. On a terminal outcome, delete `preparedTx:<id>` and `inflight:<hash>`.

## 5. Submission and ambiguity resolution

Use Horizon's **async** submit: `POST /transactions_async` with form body `tx=<base64 XDR>`, 10 s client timeout (ADR 0007). A synchronous submit can exceed Chrome's 30 s fetch limit and kill the worker.

| `tx_status` | Meaning | Action |
|---|---|---|
| `PENDING` / `DUPLICATE` | Accepted by core | → `RESOLVING` |
| `TRY_AGAIN_LATER` | Not accepted | Resubmit the **same** XDR (≥ 2 s apart) while `now < maxTime`; resolve meanwhile |
| `ERROR` (`error_result_xdr`) | Rejected | Decode and map (§8). `tx_bad_seq` → rebuild. Others → `FAILED`. |
| network error / timeout / no valid status | **Ambiguous**: may or may not have arrived | → `RESOLVING`; resubmit the same XDR if never accepted |

`CONFIRM_PAYMENT` waits up to ~20 s for a definitive outcome, then returns `{ status: "pending", hash }`. Resolution continues in the SW: on startup, on a 30 s `resolve` alarm, and while the popup polls `GET_STATUS`.

`PREPARE_PAYMENT` refuses with `TX_IN_FLIGHT` while the active account has an unresolved transaction.

Resubmitting the same signed XDR isn't signing: it doesn't run `assertSignable` again. Shield gates signatures, and the signature was checked when it was made.

### Resolving (`core/tx/resolve.ts`)

```
loop:
  GET /transactions/{hash}
    200 → SUCCESS (or FAILED if successful=false — then decode and map result_xdr)
    404 → if now > maxTime + 15s: FAILED(TX_EXPIRED_NOT_INCLUDED) — safe to rebuild
          else wait (backoff 2s, 3s, 5s, 5s, …) and loop
    network error → wait and loop (same deadline)
```

Why this is safe: after `maxTime` the network will never include the transaction, so a 404 past that point is definitive. The 15-second buffer covers ledger close time (~5–6 s) plus Horizon ingestion lag.

**Never** resubmit a *rebuilt* transaction while the original is still resolvable — that's how double-sends happen. Resubmitting the **same signed XDR** during resolution is allowed (same hash; it can only land once) and may be used if the first submit failed at the network layer before reaching Horizon.

### SW restart during submit

On SW startup, for each `inflight:<hash>` in session storage, resume resolution in the background. The popup, when reopened, asks `GET_STATUS`, whose `inflight` lists each in-flight or recently finished payment (summary, status, outcome; never the XDR). A finished outcome stays until the popup shows it (`DISMISS_OUTCOME`) or for 30 minutes.

`inflight:<hash>` holds the signed envelope until the outcome is known, so the same XDR can be resubmitted after a restart. It survives lock (no secrets needed to resolve) and is removed by reset.

## 6. "Max" button

`maxSendable = available − fee` using the fee estimate the popup fetched. If the destination is unfunded and `maxSendable < 1 XLM`, disable sending with the explanation that new accounts need at least 1 XLM. The SW recomputes during PREPARE; if the fee rose, it returns `INSUFFICIENT_BALANCE` with the new `maxSendable`, and the popup offers "Send max (X XLM)".

## 7. Friendbot (testnet only)

`core/network/friendbot.ts`: `GET {friendbotUrl}/?addr={G}`. Friendbot's own response never decides the outcome. Live, "already funded" is a 400 problem document, and a timeout can still have funded the account. After **any** response or error, refetch the account from Horizon:
- funded → success
- still unfunded → `FRIENDBOT_FAILED` (retryable)
- the refetch itself fails → that Horizon error (e.g. `NETWORK_ERROR`)

A 5xx or timeout is never shown as success. Not exposed when network = mainnet; the function throws `NOT_AVAILABLE_ON_NETWORK` if called on mainnet.

## 8. Error mapping (`core/tx/errors.ts`)

| Horizon code | Stellix `ErrorCode` | User-facing direction |
|---|---|---|
| `tx_bad_seq` | `REBUILD_NEEDED` (internal) | Auto-rebuild; re-show review |
| `tx_too_late` | `PREPARED_TX_EXPIRED` | "This took too long. Review again." |
| `tx_too_early` | `CLOCK_SKEW` | "Your computer's clock looks wrong." |
| `tx_insufficient_fee` | `FEE_TOO_LOW` | "Network is busy. Try again with a higher fee." |
| `tx_insufficient_balance` | `INSUFFICIENT_BALANCE` | Show `maxSendable` |
| `tx_bad_auth` | `SIGNING_FAILED` | "Couldn't authorize this transaction." (log diagnostic: network mismatch vs signer) |
| `tx_no_source_account` | `SOURCE_UNFUNDED` | Explain funding |
| `op_underfunded` | `INSUFFICIENT_BALANCE` | Show `maxSendable` |
| `op_low_reserve` | `BELOW_MIN_STARTING_BALANCE` or `INSUFFICIENT_BALANCE` (by op type) | Explain reserve |
| `op_no_destination` | `DESTINATION_UNFUNDED_RACE` | Destination disappeared (e.g. testnet reset); rebuild |
| `op_already_exists` | `DESTINATION_CREATED_RACE` | Destination got funded meanwhile; rebuild as payment |
| `op_malformed` | `INTERNAL_ERROR` | Should be impossible; log details |
| anything else | `UNKNOWN_TX_ERROR` | Show code in a "details" disclosure |

## 9. Outcome type

```ts
type SubmitOutcome =
  | { status: "success"; hash: string; ledger: number }
  | { status: "failed"; hash: string; error: { code: ErrorCode; message: string; details?: Record<string, string> } }
  | { status: "rebuild"; reason: "bad_seq" | "destination_changed" }
  | { status: "pending"; hash: string }; // CONFIRM returned before resolution finished
```

`details` carries only the keys the code declares in `ERROR_DETAIL_KEYS` (e.g. `INSUFFICIENT_BALANCE → { maxSendableStroops }`). Expiry is reported as `failed` (`PREPARED_TX_EXPIRED` or `TX_EXPIRED_NOT_INCLUDED`), not a rebuild. While `pending`, the popup polls `GET_STATUS` and shows "Confirming on the network…".

## 10. Tests required

- Pure: op selection table (every row), validation table (every row), fee policy clamps, summary decoding and assertion failures, error mapping.
- With a mocked `HorizonClient`: 504 → resolve → found; 504 → resolve → past maxTime → FAILED; `tx_bad_seq` → rebuild path; SEP-29 rejection; multisig rejection.
- Testnet integration: create account via `createAccount`, payment to existing, payment to M address, memo text/id round-trip visible in history.
