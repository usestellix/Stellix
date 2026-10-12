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

**Exit:** public testnet-default release on the Chrome Web Store.

---

## Post-MVP (unordered; each starts with an ADR)

- **Assets**: trustlines, USDC and other classic assets, asset list, `changeTrust`.
- **Swaps**: path payments over the SDEX; later aggregator integration.
- **Federation** (SEP-2) and address book.
- **Import `S...` secret key** (vault plaintext `type: "secretKey"`).
- **BIP39 passphrase** support.
- **dapp provider**: content script + injected SEP-43 API, Freighter-compatible shim, Stellar Wallets Kit module, per-origin permissions, raw-XDR signing with full operation rendering.
- **Soroban**: contract token balances, `signAuthEntry`, simulation previews, contract spec decoding for readable calls.
- **Anchors**: SEP-10 auth, SEP-24 deposit/withdraw, SEP-38 quotes, SEP-31.
- **Ledger** hardware wallet via WebHID.
- **Incoming payment notifications** (alarm-driven polling).
- **Mobile app** — see MOBILE_MIGRATION.md.
