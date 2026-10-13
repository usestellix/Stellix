# 0005 — scrypt parameters and accepted vault KDF bounds

- Status: Accepted
- Date: 2026-10-13

## Context
KEY_MANAGEMENT §4.3 sets a default of scrypt `N = 2^17, r = 8, p = 1, dkLen = 32` and asks for a benchmark in a real extension service worker during M1. The target is a 0.5–1.5 s unlock on a mid-range machine, dropping to `2^16` if `2^17` is too slow or runs out of memory.

The vault header also carries its own KDF parameters, so they can be raised later. That makes the header's `N` untrusted input. scrypt runs **before** AES-GCM checks the tag, so AAD binding only rejects a tampered header *after* the KDF has already allocated `128 · r · N` bytes. A header claiming `N = 2^20` at `r = 8` makes the service worker allocate about 1 GiB before anything fails.

## Measurements
`@noble/hashes` 2.4.0 `scryptAsync`, `r = 8, p = 1, dkLen = 32`, run inside an MV3 module service worker (headless Chromium 153 via Playwright, `channel: "chromium"`). Apple M1, 8 cores, 16 GiB RAM. Three runs each:

| N | Runs (ms) |
|---|---|
| 2^16 | 190, 243, 195 |
| 2^17 | 407, 587, 487 |

There were no memory errors at either setting.

## Decision
- **Keep the default `N = 2^17`.** On an M1 it takes about 0.4–0.6 s. A mid-range laptop is plausibly around 2× slower, which still lands inside the 0.5–1.5 s target. Unlock shows a progress state ("Securing your wallet…", UI_FLOWS §2.4).
- **Accepted bounds when creating or opening a vault:**
  - `2^15 ≤ N ≤ 2^18`, and N must be a power of two
  - `r = 8`, `p = 1`, `dkLen = 32`
  - 16-byte salt, 12-byte IV

  A header outside these bounds is `VAULT_CORRUPT` and scrypt never runs. `createVault` refuses to create one.
- **Why the cap is `2^18`, not `2^20`:** see Context. `2^18` (~256 MiB) leaves room to raise the default one step later; `2^20` (~1 GiB) could exhaust service-worker memory before AAD rejection. As a second guard, noble's `maxmem` is set to exactly the allowance at `N = 2^18` (`128 · 8 · (2^18 + 2)` bytes).
- **The minimum `2^15`** stops a tampered header from silently weakening a vault. It's also the N the unit tests use, so no test-only override exists.
- Passwords are NFC-normalized before the KDF, so the same visible password always yields the same key regardless of how the keyboard composed it.

## Consequences
- Raising the default above `2^18` requires a new ADR and a bounds change, because old builds would reject such vaults.
- The benchmark was taken on a fast machine. Re-measure on low-end hardware during M5 QA, and on mobile before the mobile app ships (MOBILE_MIGRATION §2). Per-platform N is fine because params live in the header.

## Alternatives considered
- **Drop to `2^16`:** halves unlock time but halves the attacker's cost. Not needed at the measured speed.
- **Trust header params with no upper bound:** rejected. It's a denial-of-service vector that fires before authentication.
- **Argon2id:** stronger memory-hardness, but the docs and the audited-library policy settled on scrypt. Revisit in a later ADR if needed.
