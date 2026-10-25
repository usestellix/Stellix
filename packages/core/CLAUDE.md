# packages/core — rules for this package

Platform-agnostic wallet logic shared by the extension and the future mobile app. Read root `CLAUDE.md` and `docs/ARCHITECTURE.md` first.

## Hard rules
- **No platform APIs.** No `chrome`, `browser`, `window`, `document`, `localStorage`, `EventSource` as a global assumption, React, React Native, WXT, or Node built-ins (`fs`, `path`, `node:crypto`, `buffer` module). ESLint enforces this; don't disable the rule.
- Platform access only through `Platform` / `KeyValueStore` / `HorizonClient` passed as parameters. No module-level singletons or mutable state.
- Crypto: `globalThis.crypto.getRandomValues`, WebCrypto `subtle` (AES-GCM), `@noble/*`, `@scure/*`. Nothing else for security-relevant code. Never `Math.random`.
- Money is `bigint` stroops. Decimal strings only at the edges (`parseXlm` / `formatXlm`).
- Throw `StellixError` with a code from the closed `ErrorCode` union. Never include secret material in errors.
- No logging except via `log.ts`; never log secrets.
- New dependencies must be pure JS, no postinstall scripts, exact-pinned, ≥ 14 days old, and justified in the commit message.

## Module map
| Dir | Governs | Doc |
|---|---|---|
| `keys/` | mnemonic, SEP-0005 derivation | KEY_MANAGEMENT §1–3 |
| `vault/` | VaultV1, scrypt, AES-GCM, AAD | KEY_MANAGEMENT §4 |
| `stellar/` | amounts, reserves, addresses, memos | STELLAR_PRIMER |
| `tx/` | validate, select op, fee, build, summary, resolve, error map | TRANSACTIONS |
| `network/` | network config, HorizonClient, Friendbot | NETWORK |
| `history/` | operation record normalization | NETWORK §5 |
| `uri/` | SEP-7 | UI_FLOWS §6 |
| `services/` | prepare/confirm/onboard/unlock orchestration called by shells | ARCHITECTURE §5–6 |
| `security/` | Shield: decode, rules, policy, report, `assertSignable`. No direct clock or network (lint-enforced) | SHIELD |

## Testing
- Every module has unit tests (TESTING §1). SEP-0005 vectors copied verbatim from the spec — never generated.
- Vault tests may lower scrypt `N` via parameter; never change the production default.
- Testnet tests use `*.testnet.test.ts` and fresh Friendbot-funded accounts.
