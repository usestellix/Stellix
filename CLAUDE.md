# CLAUDE.md — Stellix

This file is the entry point for Claude Code working in this repository. Read it fully before doing anything. It tells you what we are building, what we are *not* building, where things live, which rules are non-negotiable, and which deeper document to read before touching each part of the system.

---

## 1. What Stellix is

Stellix is a **non-custodial Stellar wallet**, shipped first as a **Chrome Manifest V3 browser extension**, later as a **mobile app** (iOS App Store / Google Play) built with Expo / React Native.

"Non-custodial" means: the user's recovery phrase and private keys are generated on the user's device, encrypted with the user's password, and never leave the device. Stellix operates no server that holds keys, balances, or user data. If the user loses both their password and recovery phrase, funds are unrecoverable — by design.

### MVP scope (what we build now)

The MVP is **XLM only**, covering four capabilities:

1. **Keys** — create a wallet (new recovery phrase), import a wallet (existing recovery phrase), set a password, lock / unlock, auto-lock, multiple derived accounts.
2. **Read** — show XLM balance, *available* balance (balance minus minimum reserve), and funded / unfunded account state.
3. **Send** — send XLM to a `G...` or `M...` address, choosing `createAccount` vs `payment` automatically, with memo support and SEP-29 memo-required enforcement.
4. **Receive** — show address + QR code + SEP-7 payment link; show transaction history (incoming and outgoing).

Network: **testnet first** (with Friendbot funding). Mainnet exists in config from day one but is gated behind an explicit settings toggle with a warning.

### Explicitly out of scope for the MVP

Do not build any of these unless the roadmap (`docs/ROADMAP.md`) says the milestone has started:

- Non-native assets, trustlines, USDC
- Swaps / path payments / SDEX
- dapp connectivity: injected provider, content scripts, SEP-43, Stellar Wallets Kit module
- Soroban: contract calls, `signAuthEntry`, contract tokens
- Anchors: SEP-10 / SEP-24 / SEP-31 / SEP-38
- Hardware wallets (Ledger)
- Importing a raw secret key (`S...`) — recovery phrase only for MVP
- BIP39 passphrase ("25th word")
- Fiat prices, portfolio charts, analytics, telemetry, crash reporting
- Any backend service operated by us

If a task seems to need one of these, stop and say so instead of building it.

---

## 2. Read-before-implement map

Before writing code for an area, read the doc for that area. These docs are the source of truth; code must match them. If code and docs disagree, flag it — don't silently pick one.

| You are about to work on… | Read first |
|---|---|
| Anything at all, first session | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md` |
| Stellar concepts (accounts, reserves, fees, sequence, memos) | `docs/STELLAR_PRIMER.md` |
| Recovery phrase, derivation, vault, password, lock/unlock | `docs/KEY_MANAGEMENT.md`, `docs/SECURITY.md` |
| Building / signing / submitting transactions | `docs/TRANSACTIONS.md`, `docs/STELLAR_PRIMER.md` |
| Horizon calls, network config, history, streaming | `docs/NETWORK.md` |
| Screens, copy, UX states | `docs/UI_FLOWS.md` |
| Tests | `docs/TESTING.md` |
| Code style, errors, naming, commits | `docs/CONVENTIONS.md` |
| What to build next | `docs/ROADMAP.md` |
| Anything that must also work on mobile | `docs/MOBILE_MIGRATION.md` |
| Why a past decision was made | `docs/decisions/` (ADRs) |

Package-level `CLAUDE.md` files exist in `packages/core/` and `apps/extension/` with rules specific to those packages.

---

## 3. Repository layout (target)

```
stellix/
├── CLAUDE.md                     ← you are here
├── package.json                  ← root, pnpm workspaces, shared scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json            ← strict TS settings shared by all packages
├── docs/                         ← design docs (source of truth)
│   └── decisions/                ← ADRs, numbered, append-only
├── packages/
│   └── core/                     ← platform-agnostic wallet logic (pure TS)
│       ├── CLAUDE.md
│       └── src/
│           ├── keys/             ← mnemonic, SEP-0005 derivation, keypair
│           ├── vault/            ← password KDF, AES-GCM encrypt/decrypt, vault format
│           ├── stellar/          ← amounts, address validation, memo, reserves math
│           ├── tx/               ← build createAccount/payment, fee selection, summary
│           ├── network/          ← Horizon client interface + implementation, network configs
│           ├── history/          ← normalize Horizon operation records
│           ├── uri/              ← SEP-7 encode/decode
│           ├── services/         ← onboard/unlock/prepare/confirm orchestration called by shells
│           ├── errors.ts         ← StellixError + error codes
│           └── platform.ts       ← StorageAdapter and other platform interfaces
└── apps/
    ├── extension/                ← Chrome MV3 shell (WXT + React)
    │   ├── CLAUDE.md
    │   ├── wxt.config.ts
    │   └── src/
    │       ├── entrypoints/
    │       │   ├── background.ts       ← service worker: the ONLY holder of secrets
    │       │   ├── popup/              ← main UI (React)
    │       │   └── onboarding/         ← full-tab page for create/import/backup
    │       ├── messaging/              ← typed RPC between UI and service worker
    │       ├── background/             ← SW handler implementations, autolock, in-flight resolution
    │       ├── storage/                ← chrome.storage adapter implementing core's StorageAdapter
    │       └── ui/                     ← shared React components, hooks
    └── mobile/                   ← (later) Expo shell, not created during MVP
```

The core/shell split is the most important structural rule: **`packages/core` must never import `chrome.*`, DOM-only APIs, React, React Native, or Node built-ins.** Everything platform-specific enters core through interfaces defined in `packages/core/src/platform.ts`. This is what makes the mobile app a new shell rather than a rewrite.

---

## 4. Tech stack

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript, `strict: true` | No `any`. See CONVENTIONS. |
| Package manager | pnpm workspaces | Lockfile committed. |
| Extension framework | WXT | MV3 manifest generation, dev reload, Chrome + Firefox builds. |
| UI | React + Tailwind CSS | No component library in MVP. |
| Stellar | `@stellar/stellar-sdk` | XDR, `TransactionBuilder`, `Keypair`, `StrKey`, Horizon types. |
| Mnemonic | `@scure/bip39` | Audited, pure JS. |
| SLIP-0010 ed25519 derivation | `micro-key-producer` (slip10) or an audited equivalent | Must pass SEP-0005 test vectors. |
| KDF | `@noble/hashes` scrypt (async variant) | Params versioned in the vault header. |
| Symmetric encryption | WebCrypto `AES-GCM` 256-bit | Available in extension SW and (polyfilled) RN. |
| Runtime validation | `zod` | All cross-context messages and all Horizon responses we depend on. |
| QR | a small pure-JS QR encoder | Pick one with zero runtime deps. |
| Unit tests | Vitest | |
| E2E | Playwright with a persistent Chromium context loading the built extension | |

Version policy: pin **exact** versions (no `^`, no `~`). Do not add a version published in the last 14 days. Every new dependency needs a one-line justification in the PR / commit message and must be pure JS (no Node built-ins) if it lands in `packages/core`.

---

## 5. Commands (target — create these in milestone M0)

```bash
pnpm install                  # install all workspaces
pnpm dev                      # WXT dev mode, loads extension with hot reload
pnpm build                    # production build of the extension
pnpm test                     # unit tests across workspaces (Vitest)
pnpm test:testnet             # integration tests against Stellar testnet (needs network)
pnpm test:e2e                 # Playwright E2E against the built (testnet-only) extension
pnpm test:e2e:mainnet         # the @mainnet E2E specs against a STELLIX_MAINNET_ENABLED=true build
pnpm typecheck                # tsc --noEmit across workspaces
pnpm lint                     # ESLint + core restriction self-test
pnpm format:check             # Prettier (CI runs this too)
pnpm zip                      # WXT store-ready zip
```

Before declaring any task done: `pnpm typecheck && pnpm lint && pnpm test` must pass. If the task touched transaction or network code, `pnpm test:testnet` must pass too.

---

## 6. Non-negotiable invariants

These are security and correctness rules. Breaking one is a bug even if all tests pass. Details and rationale are in `docs/SECURITY.md`.

**Secrets**

1. The recovery phrase, seed, and private keys exist in plaintext **only inside the background service worker**, only for the duration of an operation, and are never persisted unencrypted.
2. The single exception: during onboarding, the newly generated recovery phrase is shown to the user on the onboarding page so they can write it down. It is passed once, displayed, and dropped. The popup never receives it.
3. Secrets are never written to `console.*`, error messages, `chrome.storage.local`, URLs, or analytics. Error objects must not carry secret material in `message`, `cause`, or extra fields.
4. The unlocked session key lives in `chrome.storage.session` (memory-only, cleared on browser exit, not accessible to content scripts). Never in `chrome.storage.local`. Never in a service-worker module variable as the source of truth — the worker can be killed at any time.
5. The UI never receives a private key or secret key. It receives public keys, balances, transaction summaries, and results.

**Transactions**

6. **What the user approves is exactly what gets signed.** The service worker builds the transaction, produces a human-readable summary from the *built* transaction, stores the prepared transaction, and signs only that stored transaction after confirmation. The UI never sends raw XDR to be signed in the MVP.
7. Every signature is preceded by an assertion that the transaction's network passphrase matches the currently selected network.
8. All amounts are handled as `bigint` stroops internally. Decimal strings exist only at the edges (user input, display, SDK calls that require them). No `number` for money. No floats.
9. Never blindly resubmit a transaction. On an ambiguous submit result, resolve by looking up the transaction hash until the transaction's `maxTime` has passed. See `docs/TRANSACTIONS.md`.
10. Every transaction has timebounds. Default validity window: 180 seconds.

**Extension**

11. Manifest permissions are exactly `storage` and `alarms` for the MVP. No `host_permissions`, no `tabs`, no content scripts. Adding a permission requires an ADR.
12. No remote code, no `eval`, no `new Function`, no CSP relaxation.
13. Every `chrome.runtime.onMessage` handler validates the sender (`sender.id === chrome.runtime.id` and sender URL is an extension page) and validates the payload with zod before acting.

**Mainnet**

14. Mainnet is off by default. Switching to it requires an explicit confirmation step. The current network is always visible in the UI header. Builds without `STELLIX_MAINNET_ENABLED=true` don't offer mainnet at all; the SW refuses it (ADR 0008).

---

## 7. How to work in this repo

- **Consult the source, don't recall.** When behaviour depends on a Stellar spec (SEP-0005, SEP-7, SEP-29), Horizon response shapes, or MV3 API semantics, check the spec or the official docs before implementing. Do not reconstruct protocol details from memory. Links are in each doc.
- **Never invent test vectors.** Derivation tests use the vectors published in SEP-0005, copied verbatim. If you can't access them, stop and ask rather than generating values.
- **Plan before code** for anything spanning more than one file: state which files change, which doc sections govern them, and which tests prove it.
- **Small, verifiable steps.** Each step compiles, passes tests, and leaves the extension loadable.
- **Errors are first-class.** Every network call, storage call, and crypto call has a typed failure path mapped to a `StellixError` code. Users see mapped messages, never raw SDK/Horizon errors.
- **Update docs with decisions.** If you change behaviour a doc describes, update that doc in the same change. If you make an architectural choice not already covered, add an ADR in `docs/decisions/` using the existing format.
- **Ask, don't assume,** when a requirement is ambiguous or a doc is silent on a security-relevant choice.

---

## 8. Definition of done (per task)

- [ ] Behaviour matches the governing doc(s).
- [ ] Invariants in §6 hold.
- [ ] Unit tests cover the happy path and each named failure path.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` pass.
- [ ] Network / tx changes: `pnpm test:testnet` passes.
- [ ] UI changes: manually loaded in Chrome via `pnpm dev`; every state listed in `docs/UI_FLOWS.md` for that screen renders.
- [ ] No secrets in logs (grep the diff for `console.`).
- [ ] Docs / ADRs updated if behaviour or architecture changed.

---

## 9. Glossary

| Term | Meaning |
|---|---|
| XLM / lumen | Stellar's native asset. |
| Stroop | Smallest XLM unit. 1 XLM = 10,000,000 stroops. |
| `G...` address | Ed25519 public key in StrKey encoding; an account ID. |
| `M...` address | Muxed account: a `G` account + 64-bit ID, used by custodians instead of memos. |
| `S...` secret | Ed25519 secret seed in StrKey encoding. Never shown in MVP UI. |
| Base reserve | Per-entry XLM lock-up (currently 0.5 XLM). Minimum balance = (2 + subentries) × base reserve. |
| Horizon | Stellar's REST API server. Our read and submit backend for the MVP. |
| Friendbot | Testnet faucet that creates and funds accounts. |
| Vault | Our encrypted blob holding the recovery phrase. |
| Session key | AES key derived from the password, held in `chrome.storage.session` while unlocked. |
| Prepared transaction | A built, unsigned transaction stored in the SW awaiting user confirmation. |
| SEP | Stellar Ecosystem Proposal — the ecosystem's standards. |
