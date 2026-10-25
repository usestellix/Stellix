# ROADMAP.md — Milestones

Milestones are ordered by dependency. Each has exit criteria; a milestone is done only when all criteria pass. Don't start work belonging to a later milestone unless the current one is complete or the work is explicitly needed to unblock it.

---

## M0 — Scaffold

- pnpm workspace: `packages/core`, `apps/extension`.
- `tsconfig.base.json`, ESLint (with core import/global restrictions), Prettier.
- WXT + React + Tailwind in `apps/extension` with entrypoints: `background.ts`, `popup/`, `onboarding/`.
- Manifest permissions: `storage`, `alarms` only.
- Vitest in both packages; Playwright skeleton that loads the built extension and finds its ID.
- Root scripts from CLAUDE.md §5.
- CI: install (frozen lockfile), typecheck, lint, unit tests, build.
- `core/errors.ts`, `core/platform.ts`, `core/log.ts`, chrome storage adapter, typed messaging skeleton with sender validation and one `GET_STATUS` round-trip.

**Exit:** `pnpm dev` loads the extension; popup shows status returned by the SW; CI green.

## M1 — Keys & vault

- `core/keys`: mnemonic generate/validate/normalize, SEP-0005 derivation. SEP-0005 vectors pass.
- `core/vault`: VaultV1 create/open/openWithKey/reencrypt with AAD. scrypt benchmark in the real SW recorded in an ADR.
- SW handlers: `ONBOARD_GENERATE`, `ONBOARD_CREATE`, `ONBOARD_IMPORT` (discovery may be stubbed to index 0 until M2), `UNLOCK`, `LOCK`, `LIST_ACCOUNTS`, `ADD_ACCOUNT`, `RENAME_ACCOUNT`, `SET_ACTIVE_ACCOUNT`, `CHANGE_PASSWORD`, `REVEAL_PHRASE`, `RESET_WALLET`.
- Auto-lock via alarms.
- Onboarding tab UI (create, verify, password, import, done) and popup Unlock screen.

**Exit:** create and import work; import of a Freighter-generated phrase yields the same address; lock/unlock/auto-lock work; SW termination doesn't lose the session; E2E flows 1, 2 (address only), 4, 5 (unlock persistence), 6 pass.

## M2 — Read

- `core/network`: config, `HorizonClient` with zod schemas and retry policy, base reserve fetch, Friendbot.
- `core/stellar`: amount, reserve math, address validation.
- Account discovery on import (real).
- Home screen: balance card (total / available / reserved), unfunded state, Friendbot on testnet, network badge, account switcher.
- Settings: network switch with mainnet confirmation, custom Horizon URL with passphrase probe, auto-lock timer.
- Settings → Security screens for the M1 handlers: Reveal recovery phrase (onboarding tab in reveal mode), Change password, Reset wallet (typed "RESET"). Accounts screen (add, rename, switch).

**Exit:** balances correct for funded/unfunded/multi-subentry accounts (fixtures); Friendbot works; mainnet switch guarded; network badge always visible.

## M3 — Send

- `core/tx`: validate, op selection, fee policy, build, summary, resolve, error mapping.
- SW: `PREPARE_PAYMENT`, `CONFIRM_PAYMENT`, `CANCEL_PAYMENT`, in-flight resolution on SW startup.
- Send input, review (with expiry), result screens.
- SEP-29 enforcement; first-time destination warning; Max.

**Exit:** all TRANSACTIONS §10 tests pass; testnet integration scenarios 1–7 pass; E2E flow 3 passes; killing the SW mid-submit still resolves to a definitive outcome.

## M4 — Receive & history

- Receive screen: QR, copy, SEP-7 request link.
- `core/history`: normalization; `join=transactions` for memos.
- History list + detail; SSE while popup open with polling fallback.

**Exit:** incoming payment appears live while the popup is open; history paginates; memos shown; all UI_FLOWS states seen.

## M5 — Hardening & release prep

- Full manual QA checklist (TESTING §4).
- Reproducible build verified (two CI runs, same hash).
- Release workflow publishing zip + SHA-256.
- Store listing copy, privacy disclosure (Horizon sees IP + account IDs), screenshots.
- Incident-response doc (SECURITY §10).
- External review of `core/keys`, `core/vault`, `core/tx`, and the SW message handler before enabling mainnet in a public release.

- Mainnet Horizon provider chosen and documented: operator, history retention, rate limits, privacy terms (ADR 0006).

- `MAINNET_ENABLED` build flag (ADR 0008): the first public release is testnet-only.

**Exit:** public **testnet-only** release (0.1.0) on the Chrome Web Store. Mainnet ships in a later release, after the external review and the mainnet Horizon provider choice (ADR 0006, ADR 0009).

---

## Stellix Shield — S1 to S4

Pre-signing analysis that decodes, simulates, analyzes and gates every transaction or authorization Stellix is asked to sign, on the device (`docs/SHIELD.md`, ADR 0010). It replaces the earlier post-MVP "dapp provider" and "Soroban" items. Each phase follows the M0–M5 process: research, plan, approval, then small verified steps on a branch.

### S1 — Classic analysis, Modes A and C

- `core/security`: decoding for every classic op type, fee bumps and preconditions; the SHIELD §6.1 rules, thresholds, policy, report and `assertSignable`.
- Mode A: analysis inside `PREPARE_PAYMENT`, `assertSignable` inside `CONFIRM_PAYMENT`, findings on the Review screen.
- Mode C: the Analyze screen (paste XDR or a `web+stellar:tx` URI) and `SHIELD_ANALYZE`. Advisory only; nothing is signed.
- Classic adversarial corpus (SHIELD §10.2).

**Exit:** every classic op type decodes to plain language (fixtures captured from testnet for each); every §6.1 rule has positive and negative fixtures; the classic corpus passes; mutating any byte of a prepared transaction after analysis fails `assertSignable`; no new manifest permissions.

### S2 — Injected provider (classic)

- Content script (relay only), injected SEP-43 provider, per-origin grants, approval popup window, one request queue per origin, SEP-53 `signMessage`. `signAuthEntry` answers "not supported yet" until S3.
- **Gate before code:** an ADR for the permissions (content-script matches, host access, how the approval window opens), listing what each one exposes.
- Not in S2 (from the earlier "dapp provider" item, each needing its own plan): a Freighter-compatible shim and a Stellar Wallets Kit module.

**Exit:** provider tests (origin validation, malformed and oversized payloads, wrong network, concurrent requests) pass; every classic corpus case behaves the same in Mode B.

### S3 — Soroban

- Stellar RPC client (`simulateTransaction`, `getLedgerEntries`, `getLatestLedger`, `getNetwork` with a passphrase check), Soroban op decoding, contract spec reading, SEP-41 decoding, balance diffs from simulated events, auth-entry decoding, the SHIELD §6.2 rules, `signAuthEntry` in the provider.
- Research first: the current event format (unified / CAP-67 events), the Stellar Asset Contract interface, reading `contractspecv0` via `getLedgerEntries`, and ledger-to-time conversion for expiry display.
- Not in S3 (from the earlier "Soroban" item): contract token balances on Home. They depend on the **Assets** item below.

**Exit:** simulated diffs match post-submit balances on testnet; the Soroban corpus passes; `AUTH_TREE_UNNAMED` can't be overridden.

### S4 — Mainnet for dapp requests

- Mainnet RPC provider (ADR, same constraints as ADR 0009: no secret key, CORS for extension origins), signed threat lists (format, signing-key custody, verification, expiry), external security review of Shield and the provider, release.

**Exit:** review findings resolved or risk-accepted in writing; mainnet dapp signing enabled behind the existing `MAINNET_ENABLED` flag.

---

## Post-MVP (unordered; each starts with an ADR)

- **Assets**: trustlines, USDC and other classic assets, asset list, `changeTrust`.
- **Swaps**: path payments over the SDEX; later aggregator integration.
- **Federation** (SEP-2) and address book.
- **Import `S...` secret key** (vault plaintext `type: "secretKey"`).
- **BIP39 passphrase** support.
- **Anchors**: SEP-10 auth, SEP-24 deposit/withdraw, SEP-38 quotes, SEP-31.
- **Ledger** hardware wallet via WebHID.
- **Incoming payment notifications** (alarm-driven polling).
- **Mobile app** — see MOBILE_MIGRATION.md.
