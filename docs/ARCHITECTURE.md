# ARCHITECTURE.md — How Stellix is put together

## 1. Two layers: core and shells

```
┌───────────────────────────────────────────────────────────────┐
│                       packages/core                           │
│  keys · vault · stellar · tx · network · history · uri · errors│
│  Pure TypeScript. No chrome.*, no DOM, no React, no Node.     │
│  Talks to the platform only through interfaces (platform.ts). │
└───────────────▲───────────────────────────────▲───────────────┘
                │                               │
┌───────────────┴──────────────┐   ┌────────────┴──────────────┐
│ apps/extension (MVP)         │   │ apps/mobile (later)        │
│ WXT + React, Chrome MV3      │   │ Expo + React Native        │
│ chrome.storage adapter       │   │ SecureStore/Keychain adapter│
└──────────────────────────────┘   └────────────────────────────┘
```

**Rule:** if logic would be identical on mobile, it belongs in `core`. Shells contain only: UI, platform storage adapters, platform lifecycle (alarms, app state), and messaging.

## 2. Extension execution contexts

A Chrome MV3 extension runs code in separate contexts that do not share memory:

| Context | File | Lifetime | Holds secrets? | Role |
|---|---|---|---|---|
| **Background service worker** | `entrypoints/background.ts` | Started on events; Chrome terminates it after ~30s of inactivity | **Yes — only here** | Vault ops, unlock, signing, submit, auto-lock, prepared-tx store |
| **Popup** | `entrypoints/popup/` | Exists only while open; destroyed when it loses focus | No | Main UI |
| **Onboarding page** | `entrypoints/onboarding/` | Full tab, lives until closed | Only the freshly generated phrase, for display, once | Create / import / backup / reveal phrase |
| Content script | — | — | — | **Not present in MVP** |

Consequences you must design around:

1. **The service worker has no durable memory.** Any state that must survive termination (unlocked session, prepared transactions, last activity time) goes in `chrome.storage.session`. Module-level variables are caches only — always re-hydrate from storage when absent.
2. **The popup has no durable memory either.** Closing the popup mid-flow loses UI state. Long flows (onboarding, phrase reveal) live in the onboarding tab. The send flow is short enough for the popup; its prepared transaction lives in the SW, so reopening the popup can resume a pending review if it hasn't expired.
3. **Timers in the SW are unreliable** (`setTimeout` dies with the worker). Use `chrome.alarms` for auto-lock checks.

## 3. Storage map

### `chrome.storage.local` (persistent, on disk)

| Key | Type | Secret? | Contents |
|---|---|---|---|
| `vault` | `VaultV1` JSON | Encrypted | KDF params, salt, IV, ciphertext of the recovery phrase. See KEY_MANAGEMENT. |
| `accounts` | `AccountMeta[]` | No | `{ index, publicKey, label }` per derived account. |
| `activeAccountIndex` | `number` | No | |
| `settings` | `Settings` | No | `{ network, horizonOverrides, autoLockMinutes }` |
| `schemaVersion` | `number` | No | For storage migrations. |

### `chrome.storage.session` (memory only, cleared on browser exit)

Access level must be `TRUSTED_CONTEXTS` (the default; set it explicitly at SW startup with `chrome.storage.session.setAccessLevel`) so content scripts can never read it if they are ever added.

| Key | Contents | Cleared when |
|---|---|---|
| `sessionKey` | Raw 32-byte AES key (base64) derived from the password | Lock, auto-lock, browser exit, reset |
| `lastActivityAt` | epoch ms | Lock |
| `pendingOnboarding` | `{ mnemonic, createdAt }` during create flow only | Onboarding completes, is abandoned (>30 min), or lock |
| `preparedTx:<id>` | `{ xdr, networkId, summary, expiresAt, accountIndex }` | Confirmed, cancelled, expired, lock |

## 4. Platform interfaces (`packages/core/src/platform.ts`)

```ts
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface Platform {
  persistent: KeyValueStore;   // extension: chrome.storage.local
  session: KeyValueStore;      // extension: chrome.storage.session
  now(): number;               // injectable clock for tests
  fetch: typeof fetch;         // injectable for tests and RN
}
```

Core functions that need storage or time take a `Platform` (or the specific piece) as a parameter. No globals. Crypto uses `globalThis.crypto` (WebCrypto + `getRandomValues`), which exists in the extension SW and is polyfilled on React Native.

## 5. Messaging protocol (UI ↔ service worker)

All UI → SW communication uses `chrome.runtime.sendMessage` with a typed envelope:

```ts
type Request  = { id: string; type: RequestType; payload: unknown };
type Response =
  | { id: string; ok: true;  data: unknown }
  | { id: string; ok: false; error: { code: ErrorCode; message: string } };
```

The handler in `background.ts`:

1. Rejects if `sender.id !== chrome.runtime.id`.
2. Rejects if `sender.url` does not start with `chrome.runtime.getURL('')`.
3. Parses `payload` with the zod schema registered for `type`; rejects on failure.
4. Calls `touchActivity()` (updates `lastActivityAt`) for any request other than `GET_STATUS`.
5. Executes, catches everything, maps to `StellixError`, returns a `Response`.
6. Returns `true` from the listener to keep the channel open for async work.

### Request types (MVP)

| Type | Payload | Returns | Requires unlocked |
|---|---|---|---|
| `GET_STATUS` | — | `{ hasVault, unlocked, network, activeAccountIndex }` | No |
| `ONBOARD_GENERATE` | — | `{ words: string[] }` (onboarding page only) | No |
| `ONBOARD_CREATE` | `{ password, verifiedIndices }` | `{ accounts }` | No |
| `ONBOARD_IMPORT` | `{ mnemonic, password }` | `{ accounts }` (after discovery) | No |
| `UNLOCK` | `{ password }` | `{ ok }` | No |
| `LOCK` | — | — | No |
| `LIST_ACCOUNTS` | — | `AccountMeta[]` | No (public data) |
| `ADD_ACCOUNT` | `{ label? }` | `AccountMeta` | Yes |
| `RENAME_ACCOUNT` | `{ index, label }` | — | No |
| `SET_ACTIVE_ACCOUNT` | `{ index }` | — | No |
| `PREPARE_PAYMENT` | `{ destination, amount, memo? }` | `{ preparedId, summary, expiresAt }` | Yes |
| `CONFIRM_PAYMENT` | `{ preparedId }` | `SubmitOutcome` | Yes |
| `CANCEL_PAYMENT` | `{ preparedId }` | — | No |
| `REVEAL_PHRASE` | `{ password }` | `{ words }` (onboarding page only) | Re-auth |
| `CHANGE_PASSWORD` | `{ current, next }` | — | Re-auth |
| `SET_SETTINGS` | `Partial<Settings>` | `Settings` | No (mainnet switch confirmed in UI) |
| `RESET_WALLET` | `{ confirmation: "RESET" }` | — | No |

`ONBOARD_GENERATE` and `REVEAL_PHRASE` must reject unless `sender.url` is the onboarding page URL.

Read-only Horizon queries (balance, history, fee stats) **may run in the popup directly** via core's network module — they involve only public data. Anything that touches a secret goes through the SW.

## 6. Key flows

### 6.1 Unlock

```
Popup                     Service worker                       storage
  │ UNLOCK{password} ───────▶│
  │                          │ read vault ─────────────────────▶ local.vault
  │                          │ scrypt(password, salt, params) → K
  │                          │ AES-GCM decrypt(ciphertext, K)   (auth tag check = password check)
  │                          │   fail → INVALID_PASSWORD
  │                          │ write K ────────────────────────▶ session.sessionKey
  │                          │ write lastActivityAt ───────────▶ session
  │                          │ ensure alarm "autolock" (every 0.5 min)
  │◀──────────── {ok} ───────│
```

### 6.2 Send

```
Popup                               Service worker                         Horizon
  │ PREPARE_PAYMENT{dest,amt,memo} ─▶│
  │                                  │ validate inputs (core/stellar)
  │                                  │ load source account ─────────────────▶ GET /accounts/{src}
  │                                  │ resolve destination ─────────────────▶ GET /accounts/{dest}
  │                                  │   404 → createAccount path, else payment
  │                                  │   SEP-29 memo_required check
  │                                  │ fee ─────────────────────────────────▶ GET /fee_stats
  │                                  │ build tx (timebounds 180s), summary FROM built tx
  │                                  │ store preparedTx:<id> in session (expires = maxTime)
  │◀── {preparedId, summary} ────────│
  │  [user reviews summary]
  │ CONFIRM_PAYMENT{preparedId} ────▶│
  │                                  │ load preparedTx, check not expired, network matches
  │                                  │ decrypt vault with session key → mnemonic → keypair(index)
  │                                  │ sign, zero buffers
  │                                  │ submit ──────────────────────────────▶ POST /transactions
  │                                  │ ambiguous? resolve by hash ──────────▶ GET /transactions/{hash}
  │                                  │ delete preparedTx
  │◀── SubmitOutcome ────────────────│
```

Full details: `TRANSACTIONS.md`.

### 6.3 Auto-lock

- On unlock: `chrome.alarms.create("autolock", { periodInMinutes: 0.5 })`.
- On alarm: if `now - lastActivityAt > autoLockMinutes`, lock (clear session keys, delete prepared txs, clear alarm).
- On SW startup (`runtime.onStartup` and top-level execution): if `sessionKey` exists, re-check the timeout immediately and ensure the alarm exists.
- Popup sends a lightweight `GET_STATUS` on open; it does **not** count as activity (otherwise merely glancing at the popup would keep the wallet unlocked forever). Explicit user actions do.

## 7. Error model

`packages/core/src/errors.ts` defines:

```ts
export class StellixError extends Error {
  constructor(public code: ErrorCode, message: string, public retryable = false) { super(message); }
}
```

Error codes are a closed union (see `CONVENTIONS.md` §4). Horizon result codes are mapped to `ErrorCode`s in `core/tx/errors.ts` (see `TRANSACTIONS.md` §8). The UI maps `ErrorCode` → user-facing copy in one table (`apps/extension/src/ui/errorCopy.ts`). Raw SDK or Horizon error text never reaches the UI.

## 8. Network layer

`core/network` exposes a `HorizonClient` interface used everywhere; the implementation wraps `fetch` (not the SDK's `Horizon.Server`, to keep response validation under our control with zod). This also allows swapping Horizon for Stellar RPC + an indexer later without touching callers. Details: `NETWORK.md`.

## 9. State management in the UI

- Server-ish data (balance, history, fee stats): a small query layer with cache + refetch-on-focus. Plain hooks are fine; TanStack Query is acceptable if justified in an ADR.
- Session state (`unlocked`, `network`, `activeAccountIndex`): fetched from the SW via `GET_STATUS` on popup open and after every mutation. The SW is the source of truth; the popup never assumes.

## 10. Storage migrations

`schemaVersion` starts at `1`. On SW startup, run `migrate(fromVersion)` before handling any message. Migrations are pure functions in `apps/extension/src/storage/migrations.ts`, each tested. Vault format changes are versioned separately inside the vault (`VaultV1`, `VaultV2`…) and upgraded on next successful unlock (when the plaintext and password are both available).
