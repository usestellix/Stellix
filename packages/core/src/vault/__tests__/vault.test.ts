import { describe, expect, it } from "vitest";
import { vaultAad } from "../aad.js";
import { fromBase64, randomBytes, toBase64 } from "../encoding.js";
import { DEFAULT_SCRYPT_PARAMS, type ScryptParams } from "../kdf.js";
import type { VaultPlaintext, VaultV1 } from "../schema.js";
import { createVault, openVault, openVaultWithKey, parseVault, reencryptVault } from "../vault.js";

// Tests use the minimum allowed N (2^15) for speed; the production default is never changed.
const FAST: ScryptParams = { ...DEFAULT_SCRYPT_PARAMS, N: 2 ** 15 };
const PLAINTEXT: VaultPlaintext = {
  type: "mnemonic",
  mnemonic:
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
  createdAt: 1_760_000_000_000,
};
const PASSWORD = "correct horse battery staple";

async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  return p.then(
    () => undefined,
    (err: unknown) => (err as { code?: string }).code,
  );
}

describe("vault", () => {
  it("round-trips with the password and with the returned key", async () => {
    const { vault, key } = await createVault(PLAINTEXT, PASSWORD, FAST);
    const opened = await openVault(vault, PASSWORD);
    expect(opened.plaintext).toEqual(PLAINTEXT);
    expect(opened.key).toEqual(key);
    expect(await openVaultWithKey(vault, key)).toEqual(PLAINTEXT);
  });

  it("writes the KeyManagement §4.1 format", async () => {
    const { vault } = await createVault(PLAINTEXT, PASSWORD, FAST);
    expect(vault).toMatchObject({
      version: 1,
      kdf: { name: "scrypt", N: 2 ** 15, r: 8, p: 1, dkLen: 32 },
      cipher: { name: "AES-GCM" },
    });
    expect(fromBase64(vault.kdf.salt)).toHaveLength(16);
    expect(fromBase64(vault.cipher.iv)).toHaveLength(12);
    expect(JSON.stringify(vault)).not.toContain("abandon");
  });

  it("wrong password → INVALID_PASSWORD", async () => {
    const { vault } = await createVault(PLAINTEXT, PASSWORD, FAST);
    expect(await codeOf(openVault(vault, "wrong password"))).toBe("INVALID_PASSWORD");
  });

  it("wrong session key → LOCKED", async () => {
    const { vault } = await createVault(PLAINTEXT, PASSWORD, FAST);
    expect(await codeOf(openVaultWithKey(vault, randomBytes(32)))).toBe("LOCKED");
  });

  it("tampered header (lowered N) fails: AAD binds the KDF params", async () => {
    const { vault } = await createVault(PLAINTEXT, PASSWORD, { ...FAST, N: 2 ** 16 });
    const weakened: VaultV1 = { ...vault, kdf: { ...vault.kdf, N: 2 ** 15 } };
    expect(await codeOf(openVault(weakened, PASSWORD))).toBe("INVALID_PASSWORD");
  });

  it("tampered header fails even with the right key (AAD, not just the KDF)", async () => {
    const { vault, key } = await createVault(PLAINTEXT, PASSWORD, { ...FAST, N: 2 ** 16 });
    const weakened: VaultV1 = { ...vault, kdf: { ...vault.kdf, N: 2 ** 15 } };
    expect(await codeOf(openVaultWithKey(weakened, key))).toBe("LOCKED");
  });

  it("tampered ciphertext fails", async () => {
    const { vault } = await createVault(PLAINTEXT, PASSWORD, FAST);
    const bytes = fromBase64(vault.ciphertext);
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    expect(await codeOf(openVault({ ...vault, ciphertext: toBase64(bytes) }, PASSWORD))).toBe(
      "INVALID_PASSWORD",
    );
  });

  it("uses a fresh salt and IV for every encryption", async () => {
    const a = await createVault(PLAINTEXT, PASSWORD, FAST);
    const b = await createVault(PLAINTEXT, PASSWORD, FAST);
    expect(a.vault.kdf.salt).not.toBe(b.vault.kdf.salt);
    expect(a.vault.cipher.iv).not.toBe(b.vault.cipher.iv);
    expect(a.vault.ciphertext).not.toBe(b.vault.ciphertext);
  });

  it("re-encrypt changes salt, IV and key and keeps the plaintext", async () => {
    const before = await createVault(PLAINTEXT, PASSWORD, FAST);
    const after = await reencryptVault(PLAINTEXT, "a new password", FAST);
    expect(after.vault.kdf.salt).not.toBe(before.vault.kdf.salt);
    expect(after.vault.cipher.iv).not.toBe(before.vault.cipher.iv);
    expect(after.key).not.toEqual(before.key);
    expect((await openVault(after.vault, "a new password")).plaintext).toEqual(PLAINTEXT);
    expect(await codeOf(openVault(after.vault, PASSWORD))).toBe("INVALID_PASSWORD");
  });

  it("NFC-normalizes passwords", async () => {
    const { vault } = await createVault(PLAINTEXT, "café-password", FAST);
    expect((await openVault(vault, "café-password")).plaintext).toEqual(PLAINTEXT);
  });

  it("decrypts but rejects unusable plaintext as VAULT_CORRUPT", async () => {
    const { vault, key } = await createVault(PLAINTEXT, PASSWORD, FAST);
    const iv = randomBytes(12);
    const forged = { ...vault, cipher: { ...vault.cipher, iv: toBase64(iv) } };
    const cryptoKey = await crypto.subtle.importKey("raw", key, "AES-GCM", false, ["encrypt"]);
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: vaultAad(forged) },
      cryptoKey,
      new TextEncoder().encode('{"type":"secretKey"}'),
    );
    const corrupt = { ...forged, ciphertext: toBase64(new Uint8Array(ciphertext)) };
    expect(await codeOf(openVault(corrupt, PASSWORD))).toBe("VAULT_CORRUPT");
  });
});

describe("parseVault bounds (ADR 0005)", () => {
  async function header(): Promise<VaultV1> {
    return (await createVault(PLAINTEXT, PASSWORD, FAST)).vault;
  }

  it("rejects a missing vault as VAULT_NOT_FOUND", () => {
    expect(() => parseVault(undefined)).toThrow(
      expect.objectContaining({ code: "VAULT_NOT_FOUND" }),
    );
  });

  it.each([
    ["N above 2^18", { N: 2 ** 19 }],
    ["N = 2^20", { N: 2 ** 20 }],
    ["N below 2^15", { N: 2 ** 14 }],
    ["N not a power of two", { N: 100_000 }],
    ["r ≠ 8", { r: 16 }],
    ["p ≠ 1", { p: 2 }],
    ["dkLen ≠ 32", { dkLen: 64 }],
    ["short salt", { salt: toBase64(randomBytes(8)) }],
    ["non-base64 salt", { salt: "!!!" }],
  ])("rejects %s as VAULT_CORRUPT before running scrypt", async (_name, patch) => {
    const vault = await header();
    const tampered = { ...vault, kdf: { ...vault.kdf, ...patch } };
    expect(() => parseVault(tampered)).toThrow(expect.objectContaining({ code: "VAULT_CORRUPT" }));
    const started = performance.now();
    expect(await codeOf(openVault(tampered, PASSWORD))).toBe("VAULT_CORRUPT");
    expect(performance.now() - started).toBeLessThan(50); // no KDF ran
  });

  it.each([
    ["short IV", (v: VaultV1) => ({ ...v, cipher: { ...v.cipher, iv: toBase64(randomBytes(8)) } })],
    ["unknown cipher", (v: VaultV1) => ({ ...v, cipher: { ...v.cipher, name: "AES-CBC" } })],
    ["unknown version", (v: VaultV1) => ({ ...v, version: 2 })],
    ["extra fields", (v: VaultV1) => ({ ...v, plaintext: "x" })],
    ["empty ciphertext", (v: VaultV1) => ({ ...v, ciphertext: "" })],
  ])("rejects %s as VAULT_CORRUPT", async (_name, mutate) => {
    const tampered = mutate(await header());
    expect(() => parseVault(tampered)).toThrow(expect.objectContaining({ code: "VAULT_CORRUPT" }));
  });

  it("refuses to create a vault outside the bounds", async () => {
    expect(await codeOf(createVault(PLAINTEXT, PASSWORD, { ...FAST, N: 2 ** 19 }))).toBe(
      "INTERNAL_ERROR",
    );
  });

  it("the production default is inside the bounds and unchanged", () => {
    expect(DEFAULT_SCRYPT_PARAMS).toEqual({ N: 2 ** 17, r: 8, p: 1, dkLen: 32 });
  });
});
