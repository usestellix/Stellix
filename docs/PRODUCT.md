# PRODUCT.md — What Stellix is for

## 1. One-line description

Stellix is a non-custodial Stellar wallet that lets people hold, send, and receive XLM from their browser, with keys that never leave their device.

## 2. Who uses the MVP

The MVP user is someone who wants to **send and receive XLM** under their own custody:

- They receive XLM from exchanges, friends, or clients and want it in a wallet they control.
- They send XLM to other wallets and to exchanges (which requires memos or muxed addresses).
- They are not necessarily technical. They should never need to understand XDR, sequence numbers, or reserves — but the wallet must handle those correctly on their behalf.

## 3. Platform plan

| Phase | Platform | Why |
|---|---|---|
| MVP | Chrome MV3 extension (Firefox build via WXT as a secondary target) | Bundled, store-reviewed code; much smaller attack surface than a hosted web app. See `decisions/0001-extension-not-hosted-web.md`. |
| Later | Mobile app (Expo / React Native) for App Store + Play Store | Payments users live on phones. Reuses `packages/core` unchanged. See `MOBILE_MIGRATION.md`. |
| Later | dapp provider (SEP-43) in the extension | Lets Stellar dapps request signatures. Out of MVP scope. |

## 4. MVP feature list

### 4.1 Onboarding
- Create a new wallet: generate a 12-word recovery phrase, show it, verify the user wrote it down, set a password.
- Import a wallet: enter a 12- or 24-word recovery phrase, set a password, discover previously used accounts.
- Onboarding runs in a **full browser tab**, not the popup (the popup closes when it loses focus, which would lose state while the user writes down their phrase).

### 4.2 Security & session
- Unlock with password.
- Manual lock.
- Auto-lock after a configurable idle period (default 15 minutes; options 5 / 15 / 30 / 60 minutes).
- Lock on browser close (automatic: session storage is cleared).
- Reveal recovery phrase (requires password re-entry; shown in the onboarding-style full tab).
- Change password.
- Reset wallet (wipes all local data after typed confirmation).

### 4.3 Accounts
- Default account at derivation index 0.
- Add another account (next index).
- Rename accounts (local label only).
- Switch active account.

### 4.4 Home
- Active account name + truncated address with copy button.
- Network badge (TESTNET / MAINNET), always visible.
- XLM total balance, available balance, and reserved amount (with an explanation tooltip).
- Unfunded state: explains the account needs at least 1 XLM to exist; on testnet offers a "Fund with Friendbot" button.
- Recent activity (last ~10 items) with link to full history.

### 4.5 Send
- Destination: `G...` or `M...` address. Federation addresses (`name*domain`) are out of MVP scope.
- Amount in XLM, with a "Max" button that sends available balance minus fee.
- Optional memo (text / ID), with automatic enforcement when the destination requires one (SEP-29).
- Review screen showing exactly what will be signed: operation type, destination (full), amount, memo, fee, network.
- Result screen: success with hash + explorer link, or a mapped, actionable error.

### 4.6 Receive
- Full address, copy button, QR code.
- Optional "request amount" that produces a SEP-7 `web+stellar:pay` link and QR.

### 4.7 History
- Paginated list of payments, account creations, and account merges affecting the account.
- Each row: direction, counterparty (truncated), amount, memo (if any), time, link to explorer.

### 4.8 Settings
- Network (testnet / mainnet with confirmation). The first public release is testnet-only (ADR 0008).
- Custom Horizon URL per network (advanced).
- Auto-lock timer.
- Reveal recovery phrase, change password, reset wallet.
- About: version, build hash, link to source.

## 5. Product principles

1. **Correctness over features.** A wallet that does four things perfectly beats one that does twelve things approximately.
2. **Show the truth about money.** Never show a balance the user can't actually spend without also showing what's reserved and why.
3. **Prevent the expensive mistakes.** Missing exchange memos, sending to wrong networks, and sending entire balances are the top real-world losses. The UI is designed around stopping them.
4. **No silent failures.** Every error is mapped to a sentence the user understands plus what they can do next.
5. **Nothing phones home.** No analytics, no tracking, no Stellix server in the MVP. Network calls go to the configured Horizon (and Friendbot on testnet) only.

## 6. Success criteria for MVP

- A new user can create a wallet, fund it on testnet, send XLM to another testnet account, and see both sides in history, without reading documentation.
- A user can import a recovery phrase from Freighter or LOBSTR and see the same `G...` address(es) (SEP-0005 compatibility).
- A send to an address with `config.memo_required` set cannot be submitted without a memo.
- Killing the service worker at any point (via `chrome://serviceworker-internals` or idle timeout) never loses the unlocked session prematurely, never leaves a half-submitted transaction unresolved, and never exposes secrets.
