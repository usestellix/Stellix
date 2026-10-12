# STELLAR_PRIMER.md — Stellar facts the wallet depends on

This is the protocol knowledge Stellix relies on for XLM-only send/receive. When in doubt, verify against the official docs at https://developers.stellar.org before implementing — do not rely on recall. Values marked *(network parameter)* can change by validator vote; read them from Horizon at runtime rather than hardcoding where possible.

---

## 1. Keys and addresses (StrKey)

Stellar uses **ed25519** keypairs. Keys are displayed in **StrKey** format: base32 of `version byte ‖ payload ‖ CRC16-XModem checksum`.

| Prefix | Meaning | Length | Validate with |
|---|---|---|---|
| `G...` | Ed25519 public key = account ID | 56 chars | `StrKey.isValidEd25519PublicKey` |
| `S...` | Ed25519 secret seed | 56 chars | `StrKey.isValidEd25519SecretSeed` |
| `M...` | Muxed account (G key + 64-bit ID) | 69 chars | `StrKey.isValidMed25519PublicKey` |

Rules for Stellix:
- Destination input accepts `G...` and `M...` only. Trim whitespace; reject everything else with a specific error (`INVALID_ADDRESS`). If the user pastes an `S...` key, show a strong warning ("This is a secret key. Never share it.") and do not use it.
- Always validate checksums via the SDK, never by regex alone.
- Display addresses truncated as `GABC…WXYZ` (first 4, last 4) in lists, but **show the full address on the send review screen**.

---

## 2. The account model (differs from EVM)

A keypair is **not** an account. An account exists on the ledger only after someone creates it with a `createAccount` operation that deposits at least the minimum balance.

- Querying Horizon for an account that doesn't exist returns **HTTP 404**. That is the "unfunded" state, not an error.
- Sending XLM to a non-existent account with `payment` fails with `op_no_destination`. You must use `createAccount`.
- `createAccount` on an account that already exists fails with `op_already_exists`.
- `createAccount`'s destination is an **AccountID (`G...`) only** — it cannot target a muxed `M...` address.

### Decision table for sending XLM

| Destination format | Base `G` account exists? | Operation |
|---|---|---|
| `G...` | yes | `payment` (native) |
| `G...` | no | `createAccount` (amount ≥ minimum starting balance) |
| `M...` | yes | `payment` to the muxed address |
| `M...` | no | **Reject** (`MUXED_DESTINATION_UNFUNDED`) — you cannot create a muxed account's base account via `createAccount` to an M address, and a custodian's base account should always exist |

---

## 3. Units and amounts

- 1 XLM = **10,000,000 stroops** (7 decimal places).
- Horizon returns amounts as decimal strings with exactly 7 decimals (e.g. `"100.0000000"`).
- The SDK's operation builders take decimal strings.
- Internally Stellix uses **`bigint` stroops**. Conversion helpers live in `core/stellar/amount.ts`:
  - `parseXlm(input: string): bigint` — accepts `"1"`, `"1.5"`, `"0.0000001"`; rejects more than 7 decimals, negatives, exponents, commas, empty, `"."`, leading `+`.
  - `formatXlm(stroops: bigint, opts?): string` — for display and SDK input.
- Maximum amount is bounded by int64 stroops; reject anything that overflows.

---

## 4. Reserves and minimum balance

Every account must keep a minimum XLM balance that cannot be spent:

```
minimumBalance = (2 + num_subentries + num_sponsoring − num_sponsored) × baseReserve
```

- `baseReserve` is **0.5 XLM** today *(network parameter)*. Read it from Horizon (`GET /ledgers?order=desc&limit=1` → `base_reserve_in_stroops`) at startup per network and cache; fall back to 5,000,000 stroops only if the read fails, and log that the fallback was used.
- `num_subentries` (Horizon field: `subentry_count`), `num_sponsoring`, `num_sponsored` come from `GET /accounts/{id}`; the sponsorship fields may be absent, treat as 0. An XLM-only account created by Stellix has 0 subentries, but **imported accounts may have trustlines, offers, signers, or data entries** — always compute from the account record, never assume.
- Native balance also has `selling_liabilities` (XLM locked in open sell offers). Include it.

### Available (spendable) balance

```
available = balance − minimumBalance − selling_liabilities
```

For a send, the fee also comes out of the source balance:

```
maxSendable = available − fee
```

If `maxSendable ≤ 0`, the user cannot send. The UI shows total, reserved, and available separately.

### Minimum starting balance for `createAccount`

The new account must receive at least `2 × baseReserve` (1 XLM today). Below that the op fails with `op_low_reserve`. Validate client-side before building.

---

## 5. Transactions

A transaction contains: source account, sequence number, fee, preconditions (timebounds), memo, and 1–100 operations. Stellix MVP transactions always contain exactly **one** operation.

### 5.1 Sequence numbers

- Each account has a sequence number. A transaction must use `account.sequence + 1`. `TransactionBuilder` does this when given a freshly loaded account.
- **Always load the source account immediately before building.** Never cache the sequence across transactions.
- Stale sequence → `tx_bad_seq`. Handling: reload account, rebuild, and re-show the review (the fee or balance may have changed).

### 5.2 Fees

- Fee is specified per operation, in stroops. Minimum base fee is 100 stroops *(network parameter)*.
- Under congestion, **surge pricing** applies: transactions bidding higher get included first. You pay the *charged* fee, not necessarily the full bid.
- Read `GET /fee_stats`. Fields include `last_ledger_base_fee`, `ledger_capacity_usage`, and percentile objects `fee_charged` and `max_fee` (`p10`…`p99`, `mode`).
- Stellix fee policy (MVP): `fee = clamp(max(last_ledger_base_fee, fee_charged.p70), floor = 100, cap = settings.maxFeeStroops (default 100,000 = 0.01 XLM))`. Show the fee on review. If the cap is binding, tell the user the network is congested.
- Insufficient fee → `tx_insufficient_fee`.

### 5.3 Timebounds

- Every Stellix transaction sets `maxTime = now + 180s` (`TransactionBuilder.setTimeout(180)`).
- After `maxTime`, the transaction can **never** be included. This is what makes ambiguous submissions resolvable: wait past `maxTime`, and if the hash isn't on-chain, it definitively failed.
- Expired → `tx_too_late`.

### 5.4 Network passphrase

The signature covers `sha256(networkId)` where `networkId = sha256(passphrase)`. A transaction signed for testnet is invalid on mainnet and vice versa.

| Network | Passphrase |
|---|---|
| Testnet | `Test SDF Network ; September 2015` |
| Mainnet | `Public Global Stellar Network ; September 2015` |

Stellix asserts the prepared transaction's passphrase equals the currently selected network's passphrase before signing.

### 5.5 Signing

`tx.sign(keypair)` computes the transaction hash (`sha256(networkId ‖ ENVELOPE_TYPE_TX ‖ tx XDR)`) and appends a `DecoratedSignature` (signature hint = last 4 bytes of the public key + 64-byte signature). Stellix MVP supports only single-signer accounts at the default thresholds. If an imported account has extra signers or raised thresholds (visible in `GET /accounts/{id}` → `signers`, `thresholds`), show a warning that multisig accounts are not supported and block sending.

---

## 6. Memos

A transaction carries at most one memo.

| Type | Content | Limit |
|---|---|---|
| `MEMO_NONE` | — | — |
| `MEMO_TEXT` | UTF-8 string | **28 bytes** (bytes, not characters — emoji count as 4) |
| `MEMO_ID` | unsigned 64-bit integer | 0 … 2⁶⁴−1, parse as bigint |
| `MEMO_HASH` | 32 bytes | MVP: display only, not authorable |
| `MEMO_RETURN` | 32 bytes | MVP: display only, not authorable |

### Why memos matter

Exchanges and custodians use one shared deposit address for all customers and identify the depositor by memo. Sending to an exchange without the correct memo typically means the funds land in the exchange's pool unattributed — recovery requires the exchange's support and may fail.

### Receiving

A non-custodial wallet gives each user their own `G...` address, so **receiving never requires a memo**. Incoming memos are displayed in history because senders may attach references.

### SEP-29: memo-required accounts

Accounts that require memos signal it by setting a data entry `config.memo_required` = `"1"`. Horizon returns account data values **base64-encoded**, so the value appears as `"MQ=="`.

Stellix rule: during `PREPARE_PAYMENT`, if the destination account's `data["config.memo_required"]` decodes to `"1"` and no memo was provided and the destination is not an `M...` address, reject with `MEMO_REQUIRED`. Muxed destinations satisfy the requirement because the ID is in the address.

Spec: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0029.md

---

## 7. Muxed accounts

An `M...` address encodes a base `G...` account plus a 64-bit ID. Payments to it are credited to the base account, and Horizon records the muxed ID so the custodian can attribute the deposit. Use them as an alternative to memos.

- Decode with the SDK (`MuxedAccount.fromAddress(m, "0")` or equivalent) to get the base account for existence checks.
- Display: show the `M...` address the user entered; optionally show "Base account: G…" in review.
- Incoming history entries may contain `to_muxed` / `to_muxed_id` / `from_muxed` fields — display the muxed form when present.

---

## 8. Operation records relevant to XLM history

From `GET /accounts/{id}/payments` (which returns payment-like operations):

| `type` | Meaning for the user | Amount field |
|---|---|---|
| `create_account` | Account funded (incoming if `account` = us; outgoing if `funder` = us) | `starting_balance` |
| `payment` (native) | Sent or received XLM | `amount` |
| `account_merge` | Another account merged into ours (incoming) or ours merged away | Amount not on the record — fetch the operation's effects (`account_credited`) if shown |
| `path_payment_strict_send` / `path_payment_strict_receive` | May deliver XLM even though MVP never sends them | `amount` (received side) |

Filter non-native payments out of the MVP history view, but don't crash on them.

---

## 9. Result codes Stellix must handle

Horizon returns failures as HTTP 400 with `extras.result_codes = { transaction: string, operations?: string[] }`.

| Code | Level | Meaning |
|---|---|---|
| `tx_bad_seq` | tx | Sequence out of date |
| `tx_too_late` | tx | Past `maxTime` |
| `tx_too_early` | tx | Before `minTime` (clock skew) |
| `tx_insufficient_fee` | tx | Fee bid too low |
| `tx_insufficient_balance` | tx | Can't pay fee without dropping below reserve |
| `tx_bad_auth` | tx | Wrong signer / wrong network passphrase |
| `tx_no_source_account` | tx | Source account doesn't exist |
| `tx_failed` | tx | One or more ops failed; see `operations[]` |
| `op_underfunded` | op | Not enough spendable XLM |
| `op_low_reserve` | op | `createAccount` amount below minimum, or would drop source below reserve |
| `op_no_destination` | op | `payment` to non-existent account |
| `op_already_exists` | op | `createAccount` to existing account |
| `op_malformed` | op | Invalid amount/destination |

Mapping to Stellix error codes: `TRANSACTIONS.md` §8.

---

## 10. Testnet specifics

- Horizon: `https://horizon-testnet.stellar.org`
- Friendbot: `https://friendbot.stellar.org/?addr=<G...>` — creates and funds a testnet account (currently 10,000 test XLM).
- **Testnet is reset periodically** by SDF. All accounts disappear. The wallet must handle a previously-funded account becoming unfunded gracefully (just show the unfunded state and the Friendbot button again).

## 11. References

- Stellar docs: https://developers.stellar.org
- Horizon API reference: https://developers.stellar.org/docs/data/apis/horizon/api-reference
- SEP-0005 (key derivation): https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0005.md
- SEP-0007 (URI scheme): https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0007.md
- SEP-0029 (memo required): https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0029.md
- JS SDK: https://github.com/stellar/js-stellar-sdk
