# SECURITY.md — Threat model and security rules

Stellix holds keys that control real money. This document defines what we defend against, how, and the rules code must follow. Invariants summarized in `CLAUDE.md` §6 are expanded here.

---

## 1. Assets to protect

1. **Recovery phrase / seed / private keys** — compromise = total loss of funds.
2. **Transaction integrity** — the user must sign exactly what they intended.
3. **Password** — protects the vault at rest.
4. **Privacy** — which addresses belong to the user. (We minimize exposure by not running any server.)

## 2. Threat model

| # | Threat | Vector | Primary defense |
|---|---|---|---|
| T1 | Stolen laptop / disk image | Attacker reads `chrome.storage.local` from the browser profile on disk | Vault encrypted with scrypt + AES-GCM; strong-password guidance |
| T2 | Malicious extension update | Our Chrome Web Store account or CI is compromised and a backdoored build ships via auto-update | Hardware-key 2FA, CI-only publishing, reproducible builds, release checklist |
| T3 | Supply-chain compromise | A dependency (direct or transitive) is poisoned on npm | Minimal deps, exact pins, 14-day version age rule, lockfile review, audited crypto libs |
| T4 | Address substitution | Clipboard malware or address-poisoning (lookalike address in history) | Full-address review screen, first-send warning, never autofill from history in MVP |
| T5 | Missing memo to exchange | User error | SEP-29 enforcement, memo prominence, exchange warning |
| T6 | Wrong network | Signing for mainnet while believing it's testnet (or vice versa) | Persistent network badge, passphrase assertion before signing, mainnet confirmation |
| T7 | Unlocked browser left unattended | Physical access | Auto-lock, re-auth for phrase reveal / password change |
| T8 | Other extensions / web pages | Messaging into our extension | No externally connectable endpoints, no content scripts in MVP, sender validation on every message |
| T9 | Phishing clone extensions | Users install a lookalike | Out of code scope; store listing, official links, publisher verification |
| T10 | Secret leakage via logs/errors | Developer mistakes | Logging rules (§7), error sanitization, CI grep check |
| T11 | Weak randomness | Bad entropy for mnemonic/IV/salt | Only `crypto.getRandomValues`; never `Math.random` for anything security-relevant |
| T12 | Horizon serving false data | Compromised or malicious Horizon | Signatures don't depend on Horizon; balances could be misreported. Mitigation: default to SDF Horizon over HTTPS; custom Horizon is an advanced setting with a warning. A lying Horizon can't steal funds, only mislead the display. |

Out of scope: a fully compromised OS or browser (keyloggers, malicious browser builds). No browser wallet defends against that; hardware wallets (post-MVP) do.

## 3. Secret-handling rules

1. Plaintext secrets exist only in the **service worker**, only inside a function call, and are dropped before it returns. The single onboarding/reveal exception is in KEY_MANAGEMENT §7.
2. `Uint8Array` secrets (seed, derived private key, KDF output) are `.fill(0)`-ed after use in a `finally` block.
3. Secrets are never:
   - stored in `chrome.storage.local` unencrypted,
   - placed in URLs, query strings, or `location.hash`,
   - sent over `chrome.runtime` messaging except the documented onboarding/reveal/import payloads,
   - included in thrown errors,
   - logged.
4. Randomness: `crypto.getRandomValues` only.
5. Comparisons of secret-derived values (e.g. verification words) don't need constant-time in this context, but never short-circuit in a way that reveals which word was wrong beyond what the UI already shows.

## 4. Extension hardening

### 4.1 Manifest

```jsonc
{
  "manifest_version": 3,
  "permissions": ["storage", "alarms"],
  // no "host_permissions" — Horizon serves CORS headers, so extension-page fetches work without them
  // no "content_scripts" in MVP
  // no "externally_connectable" — no web page or other extension can message us
  // no "web_accessible_resources" in MVP
}
```

Adding any permission or manifest key above requires an ADR describing why and what it exposes.

### 4.2 CSP

Keep the MV3 default for extension pages (`script-src 'self'; object-src 'self'`). Never add `unsafe-eval` or remote script sources. No `eval`, `new Function`, `setTimeout(string)`, or inline `<script>`.

Dependencies count too: zod 4 probes `Function("")` to decide whether to JIT-compile parsers, so `apps/extension/src/messaging/protocol.ts` sets `z.config({ jitless: true })` and the probe never runs. The dev build (`pnpm dev`) relaxes the CSP for hot reload; see ADR 0004. Release builds are checked by `scripts/check-manifest.mjs`.

### 4.3 Message validation

Every handler: check `sender.id`, check `sender.url` prefix, zod-parse the payload, check the request type is allowed from that page (onboarding-only types). Unknown types → reject. See ARCHITECTURE §5.

### 4.4 `chrome.storage.session` access level

At SW startup: `chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })`. This is the default, but setting it explicitly protects against a future change that adds content scripts.

## 5. Transaction-integrity rules

1. **Build in the SW, summarize from the built transaction, sign the stored transaction.** The summary shown to the user is produced by decoding the built `Transaction` object (operations, amounts, destination, memo, fee), not from the user's input. If decoding yields anything unexpected (more than one op, op type not in the allowed set, source account mismatch), refuse to sign.
2. Prepared transactions expire at their `maxTime`. Confirming an expired one → `PREPARED_TX_EXPIRED`; the UI rebuilds.
3. Network passphrase assertion before signing (STELLAR_PRIMER §5.4).
4. Multisig / non-default thresholds on the source account → block sending (STELLAR_PRIMER §5.5).

## 6. UX-level protections

| Risk | Rule |
|---|---|
| Copying the recovery phrase | No copy button for the phrase. If added later behind an explicit setting, clear the clipboard after 60 s where the platform allows. |
| Shoulder surfing | Phrase grid blurred until the user clicks "Reveal"; auto-hide after 60 s or on blur. |
| Address poisoning | Review screen shows the **full** destination address, grouped in 4-character chunks. First-ever send to an address shows "You haven't sent to this address before." History rows never offer "send again" in MVP. |
| Pasting an `S...` key into the destination | Block with a strong warning. |
| Sending entire balance | "Max" leaves the reserve and fee automatically; it's impossible to construct a tx that fails for reserve reasons via the UI. |
| Mainnet | Off by default; switching requires checking "I understand this uses real funds". Red-tinted MAINNET badge. |

## 7. Logging rules

- Use a tiny logger wrapper (`core/log.ts`) with levels; production build strips `debug`.
- Never log: passwords, mnemonics, seeds, secret keys, session keys, vault plaintext, raw signed XDR.
- Public keys, tx hashes, Horizon status codes, and Stellix error codes are fine.
- CI check: fail the build if the diff adds `console.` outside `core/log.ts`.

## 8. Dependency policy

- Exact versions only. Lockfile committed and reviewed in every PR that changes it.
- No version younger than 14 days. Enforced by pnpm's `minimumReleaseAge: 20160` in `pnpm-workspace.yaml`, which also covers transitive dependencies. Dependency build scripts are denied unless listed in `allowBuilds` (currently none).
- GitHub Actions are pinned by commit SHA, using releases at least 14 days old.
- Crypto: `@noble/*` and `@scure/*` (audited, zero-dependency) for hashes, KDF, and BIP39. WebCrypto for AES-GCM.
- `packages/core` deps must be pure JS with no Node built-ins and no postinstall scripts.
- Run `pnpm audit` in CI; triage findings, don't blindly auto-upgrade.
- Prefer writing 30 lines over adding a dependency for trivial utilities.

## 9. Build & release

1. Releases are built **only in CI** from a tagged commit (`.github/workflows/release.yml`). No local build is ever uploaded: the maintainer rebuilds locally only to *check* that the CI zip matches.
2. CI produces the store zip, `SHA256SUMS` (the zip and every file in it) and the commit hash, attached to a **draft** GitHub release. The steps are in `.github/RELEASE.md`.
3. Builds must be reproducible: same commit + lockfile → same zip hash. Pin Node and pnpm versions in CI (`.nvmrc`, `packageManager` field). CI proves it on every push: two independent runners build the zip, and the `reproducible` job fails if their `SHA256SUMS` differ (`scripts/release-hashes.mjs`: the zip's hash plus one per file). Verified locally on 2026-10-17: identical hashes across separate runs and checkout paths.
4. Publishing setup (as it actually is for 0.1.0; revisit when maintainers join):
   - **Publisher:** "Stellix Labs" on the Chrome Web Store, with one member in the Admin role. That Google account uses two hardware security keys for 2-Step Verification, one in daily use and one spare stored separately. The store requires 2SV to publish. The GitHub org uses hardware-key 2FA too.
   - **Verified CRX uploads** are on: the store rejects any upload not signed with our RSA key. The private key is kept offline, never in a Google account or in CI, with a separate encrypted backup. Custody and recovery are in `docs/INCIDENT_RESPONSE.md`. A replacement key from store support can take up to a week.
   - **CI builds but holds no publishing credentials.** No store API service account, no OAuth token, no signing key. Uploading is a manual, signed step, so compromising CI or the Google account alone can't ship a build.
   - TODO (owner): name the Admin account owner and the trader/non-trader declaration.
5. About screen shows version + commit hash so users can compare with the release.
6. Release checklist: `.github/RELEASE.md` (changelog, permission diff, dependency diff review, E2E pass, manual testnet smoke test, hash verification, signing and upload).

## 10. Incident response

See `docs/INCIDENT_RESPONSE.md`. It covers what we can and can't do (no server, no kill switch); store rollback, emergency update, unpublish and takedown; playbooks for a malicious build, secret-exposing bugs and fund-affecting bugs; communication channels; and custody and recovery of publishing credentials and the upload-signing key.
