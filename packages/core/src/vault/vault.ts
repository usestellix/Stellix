import { StellixError } from "../errors.js";
import { vaultAad } from "./aad.js";
import { fromBase64, randomBytes, toBase64 } from "./encoding.js";
import {
  DEFAULT_SCRYPT_PARAMS,
  SCRYPT_BOUNDS,
  deriveVaultKey,
  isAllowedScryptParams,
  type ScryptParams,
} from "./kdf.js";
import {
  IV_BYTES,
  vaultPlaintextSchema,
  vaultV1Schema,
  type VaultPlaintext,
  type VaultV1,
} from "./schema.js";

// Vault encrypt/decrypt (KEY_MANAGEMENT §4.4). Returned `key` buffers are owned by the caller,
// who stores them as the session key or zeroes them.

export type KeyBytes = Uint8Array<ArrayBuffer>;

export interface VaultWithKey {
  vault: VaultV1;
  key: KeyBytes;
}

export async function createVault(
  plaintext: VaultPlaintext,
  password: string,
  params: ScryptParams = DEFAULT_SCRYPT_PARAMS,
): Promise<VaultWithKey> {
  if (!isAllowedScryptParams(params)) {
    throw new StellixError("INTERNAL_ERROR", "scrypt parameters outside allowed bounds");
  }
  const salt = randomBytes(SCRYPT_BOUNDS.saltBytes);
  const iv = randomBytes(IV_BYTES);
  const key = await deriveVaultKey(password, salt, params);
  try {
    const header = {
      version: 1 as const,
      kdf: { name: "scrypt" as const, ...params, salt: toBase64(salt) },
      cipher: { name: "AES-GCM" as const, iv: toBase64(iv) },
    };
    const data = new TextEncoder().encode(JSON.stringify(vaultPlaintextSchema.parse(plaintext)));
    try {
      const cryptoKey = await importAesKey(key);
      const ciphertext = new Uint8Array(
        await globalThis.crypto.subtle.encrypt(
          { name: "AES-GCM", iv, additionalData: vaultAad(header) },
          cryptoKey,
          data,
        ),
      );
      return { vault: { ...header, ciphertext: toBase64(ciphertext) }, key };
    } finally {
      data.fill(0);
    }
  } catch (err: unknown) {
    key.fill(0);
    throw err instanceof StellixError
      ? err
      : new StellixError("INTERNAL_ERROR", "Vault encryption failed");
  }
}

/** Password unlock. A GCM tag mismatch (wrong password or tampered vault) is INVALID_PASSWORD. */
export async function openVault(
  stored: unknown,
  password: string,
): Promise<{ plaintext: VaultPlaintext; key: KeyBytes }> {
  const vault = parseVault(stored);
  let key: KeyBytes;
  try {
    key = await deriveVaultKey(password, fromBase64(vault.kdf.salt), vault.kdf);
  } catch {
    throw new StellixError("VAULT_CORRUPT", "Vault key derivation failed");
  }
  try {
    const plaintext = await decrypt(vault, key, "INVALID_PASSWORD");
    return { plaintext, key };
  } catch (err: unknown) {
    key.fill(0);
    throw err;
  }
}

/**
 * Unlocked-session access using the stored session key. A decrypt failure here means the session
 * key no longer matches the vault, so the session is treated as LOCKED and the user re-unlocks.
 */
export function openVaultWithKey(stored: unknown, key: KeyBytes): Promise<VaultPlaintext> {
  return decrypt(parseVault(stored), key, "LOCKED");
}

/** New password: fresh salt, IV and key (KEY_MANAGEMENT §7.5). */
export function reencryptVault(
  plaintext: VaultPlaintext,
  newPassword: string,
  params: ScryptParams = DEFAULT_SCRYPT_PARAMS,
): Promise<VaultWithKey> {
  return createVault(plaintext, newPassword, params);
}

export function parseVault(stored: unknown): VaultV1 {
  if (stored === undefined) throw new StellixError("VAULT_NOT_FOUND", "No vault stored");
  const parsed = vaultV1Schema.safeParse(stored);
  if (!parsed.success) throw new StellixError("VAULT_CORRUPT", "Vault header is invalid");
  return parsed.data;
}

async function decrypt(
  vault: VaultV1,
  key: KeyBytes,
  failureCode: "INVALID_PASSWORD" | "LOCKED",
): Promise<VaultPlaintext> {
  let data: Uint8Array;
  try {
    const cryptoKey = await importAesKey(key);
    data = new Uint8Array(
      await globalThis.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: fromBase64(vault.cipher.iv), additionalData: vaultAad(vault) },
        cryptoKey,
        fromBase64(vault.ciphertext),
      ),
    );
  } catch {
    throw new StellixError(
      failureCode,
      failureCode === "LOCKED" ? "Session key does not open the vault" : "Wrong password",
    );
  }
  try {
    const parsed = vaultPlaintextSchema.safeParse(JSON.parse(new TextDecoder().decode(data)));
    if (!parsed.success) throw new Error("schema");
    return parsed.data;
  } catch {
    // Decrypted fine but the content is unusable: real corruption, not a wrong password.
    throw new StellixError("VAULT_CORRUPT", "Vault plaintext is invalid");
  } finally {
    data.fill(0);
  }
}

function importAesKey(key: KeyBytes): Promise<CryptoKey> {
  if (key.length !== SCRYPT_BOUNDS.dkLen)
    throw new StellixError("INTERNAL_ERROR", "Bad key length");
  return globalThis.crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt", "decrypt"]);
}
