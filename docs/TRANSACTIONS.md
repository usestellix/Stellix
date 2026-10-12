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
   - If exists: check SEP-29 (`data["config.memo_required"]` base64-decodes to `"1"`). If required and no memo and destination is `G` → `MEMO_REQUIRED`.
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
9. **Store** `preparedTx:<uuid>` = `{ xdr: tx.toXDR(), networkId, summary, expiresAt, accountIndex }` in session storage.
10. Return `{ preparedId, summary, expiresAt }`.

`firstTimeDestination`: true if the destination doesn't appear in the account's last 200 history records (fetched lazily; if that fetch fails, default to `true`).

## 4. Confirmation (`CONFIRM_PAYMENT`)

1. Require unlocked.
2. Load `preparedTx:<id>`. Missing → `PREPARED_TX_NOT_FOUND`. `now ≥ expiresAt − 10s` (safety margin) → delete it, `PREPARED_TX_EXPIRED`.
3. Rehydrate: `TransactionBuilder.fromXDR(xdr, passphrase)`. Assert `networkId` equals the current network; else `NETWORK_MISMATCH`.
4. Re-run the summary assertions on the rehydrated tx (defense in depth).
5. Derive keypair for `accountIndex` (KEY_MANAGEMENT §6), assert `keypair.publicKey() === tx.source`, sign, zero secrets.
6. Compute `hash = tx.hash().toString("hex")` before submitting. Persist `{ hash, maxTime }` in session as `inflight:<hash>` (so a SW restart mid-submit can still resolve it).
7. Submit (§5).
8. On a terminal outcome, delete `preparedTx:<id>` and `inflight:<hash>`.

## 5. Submission and ambiguity resolution

Use Horizon's synchronous submit: `POST /transactions` with form body `tx=<base64 XDR>`.

| Response | Meaning | Action |
|---|---|---|
| 200 | Included in a ledger; `successful: true` | `SUCCESS { hash, ledger }` |
| 400 with `extras.result_codes` | Rejected or failed | Map codes (§8). `tx_bad_seq` → `REBUILD_NEEDED`. Others → `FAILED`. |
| 504 / timeout / network error / 5xx | **Ambiguous** — may or may not land | → `RESOLVING` |

### Resolving (`core/tx/resolve.ts`)

```
loop:
  GET /transactions/{hash}
    200 → SUCCESS (or FAILED if successful=false — then map result codes from result_xdr)
    404 → if now > maxTime + 15s: FAILED(TX_EXPIRED_NOT_INCLUDED) — safe to rebuild
          else wait (backoff 2s, 3s, 5s, 5s, …) and loop
    network error → wait and loop (same deadline)
```

Why this is safe: after `maxTime` the network will never include the transaction, so a 404 past that point is definitive. The 15-second buffer covers ledger close time (~5–6 s) plus Horizon ingestion lag.

**Never** resubmit a *rebuilt* transaction while the original is still resolvable — that's how double-sends happen. Resubmitting the **same signed XDR** during resolution is allowed (same hash; it can only land once) and may be used if the first submit failed at the network layer before reaching Horizon.

### SW restart during submit

On SW startup, for each `inflight:<hash>` in session storage, resume resolution in the background. The popup, when reopened, asks `GET_STATUS` which includes any in-flight hashes and their resolution state.

## 6. "Max" button

`maxSendable = available − fee` using the fee estimate the popup fetched. If the destination is unfunded and `maxSendable < 1 XLM`, disable sending with the explanation that new accounts need at least 1 XLM. The SW recomputes during PREPARE; if the fee rose, it returns `INSUFFICIENT_BALANCE` with the new `maxSendable`, and the popup offers "Send max (X XLM)".

## 7. Friendbot (testnet only)

`core/network/friendbot.ts`: `GET {friendbotUrl}?addr={G}`. Success → refetch account. "Account already exists" response → treat as success. Not exposed when network = mainnet; the function must throw `NOT_AVAILABLE_ON_NETWORK` if called on mainnet.

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
  | { status: "failed"; hash?: string; error: { code: ErrorCode; message: string; details?: Record<string, string> } }
  | { status: "rebuild"; reason: "bad_seq" | "expired" | "destination_changed" };
```

The `resolving` state is internal to the SW; the popup observes it via polling `GET_STATUS` while a hash is in flight and shows "Confirming on the network…".

## 10. Tests required

- Pure: op selection table (every row), validation table (every row), fee policy clamps, summary decoding and assertion failures, error mapping.
- With a mocked `HorizonClient`: 504 → resolve → found; 504 → resolve → past maxTime → FAILED; `tx_bad_seq` → rebuild path; SEP-29 rejection; multisig rejection.
- Testnet integration: create account via `createAccount`, payment to existing, payment to M address, memo text/id round-trip visible in history.
