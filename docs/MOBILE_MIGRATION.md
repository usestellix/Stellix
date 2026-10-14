# MOBILE_MIGRATION.md — Keeping the path to iOS/Android open

The mobile app is **not** built during the MVP. This document exists so MVP code doesn't accidentally make mobile harder. Any change to `packages/core` should be checked against it.

---

## 1. Target

- **Expo (React Native)**, managed workflow with development builds, shipped to App Store and Google Play.
- `apps/mobile` consumes `@stellix/core` unchanged.

## 2. What carries over unchanged

| Core module | Mobile requirement |
|---|---|
| `keys` (`@scure/bip39`, SLIP-0010) | Pure JS — works. Needs `crypto.getRandomValues` → `react-native-get-random-values` (or `expo-crypto`) imported first in the app entry. |
| `vault` (scrypt + AES-GCM) | scrypt (`@noble/hashes`) is pure JS — works, but slower on low-end phones; benchmark and tune N per platform (params are in the vault header, so per-platform N is fine). AES-GCM needs WebCrypto `subtle`: use a vetted RN WebCrypto polyfill or switch the AES implementation to `@noble/ciphers` (`gcm`) behind the same function signatures. **Decide by ADR before mobile starts; prefer `@noble/ciphers` in core from the beginning if it simplifies both platforms.** |
| `stellar`, `tx`, `history`, `uri` | `@stellar/stellar-sdk` works in RN with a `Buffer` global polyfill (`buffer` package) set in the app entry. |
| `network` | Uses injected `fetch` — works. SSE: core supplies `historyStreamUrl` and `parseHistoryRecord`; the extension's history controller (`apps/extension/src/ui/lib/history-controller.ts`) takes the `EventSource` constructor and the store as parameters and falls back to polling without one. RN has no `EventSource`: pass a small polyfill, or nothing to poll. The controller has no browser dependency beyond those parameters, so it can move into core when the mobile shell needs it. |
| `errors`, `platform` | Unchanged. |

## 3. What gets reimplemented in the mobile shell

| Concern | Extension | Mobile |
|---|---|---|
| Persistent store | `chrome.storage.local` | `expo-secure-store` for the vault (Keychain / Keystore-backed), regular storage (e.g. MMKV) for non-secret settings and account metadata |
| Session store | `chrome.storage.session` | In-memory in the JS runtime + cleared on background/lock. Optionally store the session key in SecureStore with `requireAuthentication: true` (biometric-gated) for quick unlock. |
| Auto-lock | `chrome.alarms` | `AppState` change listener (lock on background after N seconds) + foreground timer |
| Secret isolation | Service worker vs popup | Single JS runtime: enforce the same discipline by keeping all secret operations inside a `secure/` module that exposes only the same request API the SW exposes. Reuse the message types and zod schemas as a plain function-call interface. |
| Biometric unlock | — | `expo-local-authentication` gating access to the SecureStore-held key; password remains the root. |
| Screenshot protection | — | Block screenshots on phrase screens (`expo-screen-capture`). |
| Deep links | — | Register `web+stellar:` handling (SEP-7) where the OS allows; scan QR codes with the camera (`expo-camera`). |

## 4. Rules for MVP code to keep this cheap

1. Nothing in `packages/core` touches `chrome`, `window`, `document`, `localStorage`, `Buffer` as a global assumption without import, or Node built-ins (enforced by ESLint — CONVENTIONS §7).
2. All storage via `KeyValueStore`; all time via `Platform.now`; all HTTP via `Platform.fetch`.
3. The SW's request handlers are thin: validate → call a core "service" function → return. The core service functions (`prepareService.ts`, etc.) take `Platform` + `HorizonClient` and contain the logic. Mobile's `secure/` module calls the same service functions.
4. UI logic that's not React-DOM-specific (form validation, formatting, state machines) lives in core or in a shared `packages/ui-logic` (create only when mobile starts).
5. Don't use browser-only libraries for QR generation in core; QR rendering stays in the shell.

## 5. Recovery-phrase portability

Because derivation follows SEP-0005, a user can move from the Stellix extension to Stellix mobile (or any SEP-0005 wallet) by importing the same phrase. No sync service is needed or planned.
