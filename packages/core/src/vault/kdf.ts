import { scryptAsync } from "@noble/hashes/scrypt.js";

// scrypt parameters (KEY_MANAGEMENT §4.3, ADR 0005).

export interface ScryptParams {
  N: number;
  r: number;
  p: number;
  dkLen: number;
}

/** Production default. Benchmarked in a real MV3 service worker (ADR 0005). Never lower it for tests. */
export const DEFAULT_SCRYPT_PARAMS: ScryptParams = { N: 2 ** 17, r: 8, p: 1, dkLen: 32 };

/**
 * Accepted parameter range when creating or opening a vault (ADR 0005). scrypt runs before the
 * GCM tag check, so the header's N is untrusted input: capping it bounds memory use (2^18 at
 * r=8 is ~256 MiB) before AAD binding can reject a tampered header.
 */
export const SCRYPT_BOUNDS = {
  minLogN: 15,
  maxLogN: 18,
  r: 8,
  p: 1,
  dkLen: 32,
  saltBytes: 16,
} as const;

/** noble's accounting is 128·r·(N+p+1); this is exactly the maximum the bounds allow. */
const SCRYPT_MAXMEM = 128 * SCRYPT_BOUNDS.r * (2 ** SCRYPT_BOUNDS.maxLogN + SCRYPT_BOUNDS.p + 1);

export function isAllowedScryptParams(params: ScryptParams): boolean {
  const logN = Math.log2(params.N);
  return (
    Number.isInteger(logN) &&
    logN >= SCRYPT_BOUNDS.minLogN &&
    logN <= SCRYPT_BOUNDS.maxLogN &&
    params.r === SCRYPT_BOUNDS.r &&
    params.p === SCRYPT_BOUNDS.p &&
    params.dkLen === SCRYPT_BOUNDS.dkLen
  );
}

/**
 * Derives the 32-byte vault key. Passwords are NFC-normalized so the same visible password always
 * yields the same key regardless of how the keyboard/IME composed it.
 * The caller owns the returned buffer and must `.fill(0)` it when done.
 */
export function deriveVaultKey(
  password: string,
  salt: Uint8Array,
  params: ScryptParams,
): Promise<Uint8Array<ArrayBuffer>> {
  const passwordBytes = new TextEncoder().encode(password.normalize("NFC"));
  return scryptAsync(passwordBytes, salt, { ...params, maxmem: SCRYPT_MAXMEM })
    .then((derived) => {
      // Copy into an ArrayBuffer-backed array (what WebCrypto's types require), zero the original.
      const key = new Uint8Array(derived.length);
      key.set(derived);
      derived.fill(0);
      return key;
    })
    .finally(() => {
      passwordBytes.fill(0);
    });
}
