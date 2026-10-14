import { StrKey } from "@stellar/stellar-sdk/base";

// Address checks (STELLAR_PRIMER §1). Checksums validated by the SDK, never by regex alone.

export function isAccountId(value: string): boolean {
  return StrKey.isValidEd25519PublicKey(value);
}

export function isMuxedAddress(value: string): boolean {
  return StrKey.isValidMed25519PublicKey(value);
}

/** Used only to warn when a secret seed is pasted where an address belongs. */
export function looksLikeSecretSeed(value: string): boolean {
  return StrKey.isValidEd25519SecretSeed(value);
}
