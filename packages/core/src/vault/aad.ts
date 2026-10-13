import type { VaultV1 } from "./schema.js";

/**
 * AES-GCM additional data (KEY_MANAGEMENT §4.2): canonical JSON of the header without iv and
 * ciphertext, keys in a fixed order. Binds the KDF params to the ciphertext, so weakening them
 * in storage makes decryption fail.
 */
export function vaultAad(
  vault: Pick<VaultV1, "version" | "kdf" | "cipher">,
): Uint8Array<ArrayBuffer> {
  const { kdf } = vault;
  const canonical = JSON.stringify({
    version: vault.version,
    kdf: { name: kdf.name, N: kdf.N, r: kdf.r, p: kdf.p, dkLen: kdf.dkLen, salt: kdf.salt },
    cipher: { name: vault.cipher.name },
  });
  return new TextEncoder().encode(canonical);
}
