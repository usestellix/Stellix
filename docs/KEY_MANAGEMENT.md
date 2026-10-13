# KEY_MANAGEMENT.md — Recovery phrase, derivation, vault, sessions

All code in this document lives in `packages/core/src/keys/` and `packages/core/src/vault/`, and is invoked **only from the extension service worker** (and later the mobile app's secure module). Read `SECURITY.md` alongside this.

---

## 1. Recovery phrase (BIP39)

- Library: `@scure/bip39` with the English wordlist.
- **Create:** `generateMnemonic(wordlist, 128)` → 12 words. (12 words = 128 bits of entropy; matches Freighter/LOBSTR defaults.)
- **Import:** accept 12 or 24 words. Normalize before validating:
  - lowercase, trim, collapse internal whitespace to single spaces
  - Unicode NFKD (BIP39 requirement)
  - `validateMnemonic(normalized, wordlist)` must pass (checks wordlist membership and checksum)
- Do **not** silently auto-correct misspelled words. If a word isn't in the wordlist, highlight that word position. If all words are valid but the checksum fails, say so ("These words don't form a valid recovery phrase — check the order and spelling").
- BIP39 passphrase (the optional "25th word") is **not supported in the MVP**. Always derive with an empty passphrase. (Supporting it later requires a vault field and UI; ADR first.)

## 2. Key derivation (SEP-0005)

SEP-0005 specifies:

1. `seed = BIP39 mnemonicToSeed(mnemonic, passphrase = "")` → 64 bytes (PBKDF2-HMAC-SHA512, 2048 rounds, salt `"mnemonic" + passphrase`).
2. Derive with **SLIP-0010 for ed25519** along path `m/44'/148'/x'`, where `x` is the account index. All levels are hardened (ed25519 under SLIP-0010 supports hardened derivation only).
3. The 32-byte private key at that node is the ed25519 secret seed: `Keypair.fromRawEd25519Seed(key)`. It's imported from `@stellar/stellar-sdk/base`; SDK 17 takes a plain `Uint8Array`, so core never needs `Buffer`.

Implementation:

```ts
// core/keys/derive.ts
export function deriveKeypair(seed: Uint8Array, index: number): Keypair
export function derivePublicKey(seed: Uint8Array, index: number): string  // G...
```

- `index` is a non-negative integer < 2³¹.
- Use an audited SLIP-0010 implementation (`micro-key-producer`'s slip10 module or equivalent). Do not hand-roll HMAC chains.
- We use `micro-key-producer`. It's built on audited noble primitives, but the slip10 module itself has no separate audit, so it's also tested against the SLIP-0010 spec's own ed25519 vectors (`slip0010.vectors.ts`).

### Test vectors — mandatory

SEP-0005 publishes test vectors (mnemonics with expected `G...`/`S...` for indices 0–9, including a 24-word vector and a vector with a passphrase). Copy them **verbatim** from the spec into `packages/core/src/keys/__tests__/sep0005.vectors.ts`. `scripts/extract-test-vectors.mjs` regenerates both vector files mechanically. It fetches each spec at a pinned commit and verifies its SHA-256. Every vector without a passphrase must pass. (Keep the passphrase vector in the file but skipped, with a comment, until passphrase support exists.)

**Never generate expected values yourself.** If the spec can't be fetched, stop and ask.

This test is the compatibility guarantee: passing it means a phrase from Freighter, LOBSTR, or any SEP-0005 wallet yields the same accounts in Stellix.

## 3. Account discovery on import

After import, find which accounts the user has used:

```
for index = 0, 1, 2, …:
  pk = derivePublicKey(seed, index)
  exists = GET /accounts/{pk} on the selected network → 200 = exists, 404 = not
  if exists: record index
  stop after GAP_LIMIT (= 5) consecutive non-existent indices
always include index 0 even if unfunded
```

- Run discovery on the currently selected network (testnet by default). When the user switches networks, offer "Scan for accounts on this network".
- Discovery is a read-only Horizon operation but needs the seed, so it runs in the SW. Derive public keys, then zero the seed buffer, then make network calls with public keys only.
- Network failures during discovery must not abort onboarding: finish with what was found plus index 0, and show "Couldn't check for other accounts — you can add them later in Accounts".

## 4. The vault

The vault is the only persistent secret. It stores the recovery phrase encrypted with a key derived from the user's password.

### 4.1 Format (`VaultV1`)

Stored at `chrome.storage.local["vault"]`:

```json
{
  "version": 1,
  "kdf": {
    "name": "scrypt",
    "N": 131072,
    "r": 8,
    "p": 1,
    "dkLen": 32,
    "salt": "<base64, 16 random bytes>"
  },
  "cipher": {
    "name": "AES-GCM",
    "iv": "<base64, 12 random bytes>"
  },
  "ciphertext": "<base64, includes 16-byte GCM tag>"
}
```

Plaintext before encryption (UTF-8 JSON):

```json
{ "type": "mnemonic", "mnemonic": "word1 word2 …", "createdAt": 1760000000000 }
```

The `type` field leaves room for future `"secretKey"` entries (imported `S...` keys) without a format break.

### 4.2 Associated data

Use AES-GCM `additionalData` = the canonical JSON serialization of `{ version, kdf, cipher.name }` (everything except `iv` and `ciphertext`, with keys in fixed order). This binds the header to the ciphertext: tampering with KDF params to weaken them makes decryption fail.

### 4.3 KDF parameters

- Default: scrypt `N = 2^17`, `r = 8`, `p = 1`, 32-byte output. That's ~128 MiB of memory and on the order of 1 second in JS on a mid-range laptop.
- **Benchmark during M1** using `@noble/hashes/scrypt`'s async API in the actual extension service worker. Target 0.5–1.5 s unlock on a mid-range machine. If `2^17` is too slow or runs out of memory in the SW, drop to `2^16` and record the measurement in an ADR.
- Params live in the header so they can be raised later; upgrade happens on next successful unlock (decrypt with old params, re-encrypt with new).
- Measured in M1: `2^17` takes about 0.4–0.6 s in a real SW on an Apple M1, so the default stands. Headers are only accepted within `2^15 ≤ N ≤ 2^18`, `r = 8`, `p = 1`, `dkLen = 32`, 16-byte salt and 12-byte IV; anything else is `VAULT_CORRUPT` before scrypt runs. Passwords are NFC-normalized before the KDF. See ADR 0005.

### 4.4 Encrypt / decrypt

```ts
// core/vault/vault.ts
export async function createVault(plaintext: VaultPlaintext, password: string): Promise<{ vault: VaultV1; key: Uint8Array }>
export async function openVault(vault: VaultV1, password: string): Promise<{ plaintext: VaultPlaintext; key: Uint8Array }>
export async function openVaultWithKey(vault: VaultV1, key: Uint8Array): Promise<VaultPlaintext>
export async function reencryptVault(plaintext: VaultPlaintext, newPassword: string): Promise<{ vault: VaultV1; key: Uint8Array }>
```

- Fresh random salt and IV from `crypto.getRandomValues` on every `createVault` / `reencryptVault`. **Never reuse an IV with the same key.**
- Import the 32-byte KDF output via `crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt","decrypt"])`.
- Wrong password → `crypto.subtle.decrypt` throws (GCM tag mismatch) → map to `INVALID_PASSWORD`. With the session key (`openVaultWithKey`), a tag mismatch means the session key no longer matches the vault → `LOCKED`, so the user unlocks again. Do not distinguish "wrong password" from "corrupted vault" to the user beyond that; log a non-secret diagnostic code for corruption if JSON parsing of plaintext fails after a successful decrypt.

## 5. Password policy

- Minimum 8 characters. Show a strength meter (length + character classes is enough; no external library needed).
- Confirm field must match.
- Clear warning on creation: "Stellix can't recover this password. If you forget it, you'll need your recovery phrase."
- No password hints stored.

## 6. Sessions (unlocked state)

- On successful unlock, write the 32-byte derived key (base64) to `chrome.storage.session["sessionKey"]`. The password itself is never stored anywhere.
- To sign: read `sessionKey` → `openVaultWithKey` → `mnemonicToSeed` → `deriveKeypair(index)` → sign → zero the seed `Uint8Array` and the raw key bytes (`.fill(0)`) → drop references.
- JS strings (the mnemonic) can't be zeroed; minimize their lifetime and scope. Never assign them to module-level variables.
- Caching: deriving the seed (PBKDF2, 2048 rounds) per signature is cheap enough; **do not cache the seed or keypair** between operations.

### Lock

Locking deletes `sessionKey`, `lastActivityAt`, `pendingOnboarding`, and every `preparedTx:*` key from session storage, and clears the `autolock` alarm.

### Auto-lock

See `ARCHITECTURE.md` §6.3. Default 15 minutes.

### Re-authentication

Revealing the recovery phrase and changing the password require the password even when unlocked: run `openVault(vault, password)` fresh. This guards against someone walking up to an unlocked browser.

## 7. Flows

### 7.1 Create

1. Onboarding page sends `ONBOARD_GENERATE`. SW generates the mnemonic, stores it in `session.pendingOnboarding`, returns the words.
2. Page displays the words in a numbered grid with a "I've written it down" button. No copy button by default (see SECURITY §6). Blur the grid until the user clicks "Reveal".
3. Verification: ask for 3 random word positions (e.g. #3, #7, #11). The page sends the user's answers inside `ONBOARD_CREATE`; the SW checks them against `pendingOnboarding`.
4. Password step.
5. SW: `createVault`, store vault, derive index 0 public key, write `accounts`, write `sessionKey` (user is unlocked), delete `pendingOnboarding`.
6. Page shows "You're all set", instructs the user to open Stellix from the toolbar.

If the onboarding tab is closed before step 5, `pendingOnboarding` is discarded after 30 minutes or on lock; nothing persistent was written.

### 7.2 Import

1. Page collects words (one input per word, with wordlist autocomplete and paste-to-fill), validates locally for UX, sends `ONBOARD_IMPORT{ mnemonic, password }`.
2. SW validates again (never trust UI validation), creates the vault, runs discovery (§3), writes accounts, unlocks.

### 7.3 Add account

`ADD_ACCOUNT`: next index = `max(existing indices) + 1`. Derive public key, append to `accounts`. Requires unlocked.

### 7.4 Reveal phrase

Opens the onboarding page in "reveal" mode → password → `REVEAL_PHRASE` → display with blur-until-click → auto-hide after 60 seconds or on tab blur.

### 7.5 Change password

`CHANGE_PASSWORD{ current, next }` → `openVault(current)` → `reencryptVault(next)` → write vault → replace `sessionKey`. Atomic: write the new vault only after successful re-encryption.

### 7.6 Reset wallet

Typed confirmation "RESET". Clears all `chrome.storage.local` and `chrome.storage.session` keys, clears alarms, opens onboarding. Warn that without the recovery phrase the funds are gone.
