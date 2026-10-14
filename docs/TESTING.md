# TESTING.md — How Stellix is tested

Three layers. Each has a clear job; don't use a slower layer for something a faster one can prove.

| Layer | Tool | Where | Runs | Proves |
|---|---|---|---|---|
| Unit | Vitest | `packages/core/**/__tests__`, `apps/extension/src/**/__tests__` | Every commit | Pure logic: derivation, vault, amounts, validation, op selection, fee policy, summaries, error mapping, history normalization, message schemas |
| Integration (testnet) | Vitest, `*.testnet.test.ts` | `packages/core/src/**/__tests__` | `pnpm test:testnet`, CI nightly + on tx/network changes | Real Horizon behaviour: create account, payments, memos, muxed, history shapes, fee stats parsing |
| E2E | Playwright | `apps/extension/e2e/` | `pnpm test:e2e`, CI on PRs touching the extension | The built extension: onboarding, unlock, send, receive, lock, SW restart |

---

## 1. Unit tests

### Mandatory suites

| Suite | Must cover |
|---|---|
| `keys/sep0005.test.ts` | All SEP-0005 vectors (verbatim from the spec), indices 0–9 for each. Passphrase vector present but `skip`ped with a comment. |
| `keys/mnemonic.test.ts` | Normalization (case, whitespace, NFKD), 12/24 acceptance, unknown-word detection with positions, checksum failure. |
| `vault/vault.test.ts` | Round-trip; wrong password → `INVALID_PASSWORD`; tampered header (lower N) → fails (AAD binding); tampered ciphertext → fails; fresh salt/IV per encryption; re-encrypt changes salt/IV and keeps plaintext. Use reduced scrypt N in tests via a parameter — never change the production default for speed. |
| `stellar/amount.test.ts` | Every accept/reject case in STELLAR_PRIMER §3; round-trips; int64 overflow. |
| `stellar/reserve.test.ts` | Minimum balance with subentries / sponsoring / sponsored / selling liabilities. |
| `stellar/memo.test.ts` | 28-byte limit with multibyte chars (emoji, accented), ID bounds 0 and 2⁶⁴−1, 2⁶⁴ rejected. |
| `tx/validate.test.ts` | Every row in TRANSACTIONS §2. |
| `tx/select-op.test.ts` | Every row in STELLAR_PRIMER §2 table. |
| `tx/fee.test.ts` | Floor, cap, percentile choice, fallback when fee_stats fails. |
| `tx/summary.test.ts` | Summary built from tx matches inputs; rejects multi-op, wrong op type, wrong source. |
| `tx/resolve.test.ts` | With fake clock + fake Horizon: found immediately, found after N polls, never found → FAILED after maxTime+buffer, network errors during polling. |
| `tx/errors.test.ts` | Every row in TRANSACTIONS §8. |
| `history/normalize.test.ts` | Fixtures for each operation type and direction, muxed fields, non-native filtered. |
| `uri/sep7.test.ts` | Encode/decode with amount, memo, memo_type; URL-encoding of memo text. |
| `messaging/schemas.test.ts` (extension) | Each request type accepts valid payloads and rejects malformed ones. |
| `messaging/sender.test.ts` (extension) | Rejects foreign `sender.id`, non-extension URLs, onboarding-only types from the popup. |

### Fixtures

Horizon response fixtures live in `packages/core/src/__fixtures__/horizon/*.json`, captured from real testnet responses (scrub nothing — they're public), named by scenario (`account-funded.json`, `account-multisig.json`, `account-memo-required.json`, `submit-bad-seq.json`, `payments-mixed.json`…). Re-capture when Horizon changes; zod schema tests run against every fixture.

### Fakes

- `FakeHorizonClient` implementing `HorizonClient` with scripted responses.
- `MemoryKeyValueStore` implementing `KeyValueStore`.
- Fake clock via `Platform.now`.

## 2. Testnet integration tests

- Suffix `*.testnet.test.ts`; excluded from `pnpm test`, included in `pnpm test:testnet`.
- Each test generates fresh keypairs and funds them via Friendbot. Never reuse accounts across runs; never depend on pre-existing testnet state (testnet resets).
- Generous timeouts (60 s per test). Retry Friendbot up to 3 times.
- Required scenarios:
  1. `createAccount` from A to new B with 1 XLM → B exists with 1 XLM.
  2. `payment` A → B, memo text → history on B shows memo via `join=transactions`.
  3. `payment` to `M` address of B with ID → Horizon record has `to_muxed_id`.
  4. SEP-29: set `config.memo_required` on B (via `manageData` built in the test), then prepare to B without memo → `MEMO_REQUIRED`.
  5. Stale sequence: build two txs from the same loaded account, submit both → second gets `tx_bad_seq` → mapped to rebuild.
  6. Max send: send `maxSendable` → succeeds, remaining balance = minimum balance.
  7. fee_stats parses.

## 3. E2E (Playwright)

Load the unpacked built extension in a persistent Chromium context:

```ts
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: "chromium", // bundled Chromium supports extensions headless (playwright.dev/docs/chrome-extensions)
  args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`],
});
```

Get the extension ID from the service worker URL, then open `chrome-extension://<id>/popup.html` and `onboarding.html` as pages. Fixtures live in `apps/extension/e2e/fixtures.ts`. `pnpm test:e2e` builds first and tests `.output/chrome-mv3`. Set `STELLIX_EXTENSION_DIR` to test another build (e.g. the `wxt` dev build; the manifest-permission test skips there, see ADR 0004).

To terminate the SW, use CDP `ServiceWorker.stopAllWorkers` from a page session. Playwright emits no new `serviceworker` event when an extension worker restarts, so watch `ServiceWorker.workerVersionUpdated` running status to prove the stop and the restart.

Required flows (testnet, live network):
1. Create wallet → verify words → password → popup unlocked → Friendbot → balance shows.
2. Import a known testnet phrase (generated in test setup) → same `G...` as derived in Node.
3. Send to a fresh address (activation) → success → history shows it.
4. Lock → unlock wrong password → error → correct password → home.
5. **SW termination**: unlock, terminate the SW (via CDP `ServiceWorker.stopWorker` or by waiting out idle), reopen popup → still unlocked (session storage survived) → send works.
6. Auto-lock: set auto-lock to minimum, advance time (or wait), confirm locked.
7. Mainnet switch shows confirmation and badge changes (no transactions on mainnet in E2E).

M1 runs these as follows (`apps/extension/e2e/m1-flows.spec.ts`). They use the production scrypt N.
- **Flow 1** stops at "popup unlocked". Friendbot and balance are added in M2.
- **Flow 2** imports the SEP-0005 Test 5 phrase by paste-to-fill and compares the popup's address with the spec's `G…`, read from the generated vectors file.
- **Flow 6** writes `lastActivityAt` 16 minutes into the past from the SW, sends no request, and waits for the real 30 s alarm to lock. The auto-lock timer UI is M2.
- **M2 (`e2e/m2-flows.spec.ts`, live testnet):**
  - Flow 1 completes with Friendbot: 10,000 total, 9,999 available, 1 reserved.
  - Flow 7: the mainnet `<dialog>` is gated by its checkbox, and the SW refuses `SET_SETTINGS` without `acknowledgedRealFunds`.
  - Import discovers a pre-funded index 1 of a fresh phrase.
  - Accounts: add, rename, switch.
  - Settings: auto-lock, custom Horizon (https + passphrase probe), About.
  - Security: change password, reveal phrase in its own tab, reset.
  - Blocking Horizon with `context.route` shows the error state with the greyed last-known balance.
- **M3 (`e2e/m3-flows.spec.ts`, live testnet):**
  - Flow 3: activate a fresh address. The recipient's balance is checked from Node; the history assertion moves to M4.
  - A text-memo payment to an existing account.
  - SEP-29: an account with the data entry set in test setup auto-opens the memo, and sending without one is blocked.
  - Insufficient balance offers "Send max".
  - A network switch between Review and Confirm gives `NETWORK_MISMATCH`, then Review again.
  - **M3 exit:** the SW is killed ~150 ms after Confirm. Resolution must leave nothing "resolving", and the recipient is funded **iff** the wallet reports success (no double send, no false report).
- **Also covered:**
  - the SW-enforced unlock throttle, checked from a fresh popup
  - the popup being refused `ONBOARD_GENERATE` / `REVEAL_PHRASE`
  - `RESET_WALLET` wiping storage and reopening onboarding without the `tabs` permission

## 4. Manual QA checklist (before each release)

- [ ] Fresh Chrome profile install from the built zip.
- [ ] Import a phrase created in Freighter → same address (SEP-0005 compat).
- [ ] Phrase grid blurred until reveal; no copy button.
- [ ] Send to an exchange-style address with SEP-29 flag → blocked without memo.
- [ ] Dark mode renders.
- [ ] Every state in UI_FLOWS for Home, Send, Receive, History seen.
- [ ] No `console` output containing secrets (open SW devtools during a full flow).
- [ ] Manifest permissions = `storage`, `alarms`.
