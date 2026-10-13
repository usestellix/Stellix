import { Keypair } from "@stellar/stellar-sdk/base";
import { mnemonicToSeed as bip39ToSeed } from "@scure/bip39";
import { HDKey } from "micro-key-producer/slip10.js";
import { StellixError } from "../errors.js";

// SEP-0005 derivation (KEY_MANAGEMENT §2): BIP39 seed, then SLIP-0010 ed25519 at m/44'/148'/x'.

const MAX_INDEX = 2 ** 31 - 1;

/**
 * 64-byte BIP39 seed with an empty passphrase (no "25th word" in the MVP).
 * The caller owns the buffer and must `.fill(0)` it after use.
 */
export function mnemonicToSeed(mnemonic: string): Promise<Uint8Array> {
  return bip39ToSeed(mnemonic, "");
}

export function assertAccountIndex(index: number): void {
  if (!Number.isSafeInteger(index) || index < 0 || index > MAX_INDEX) {
    throw new StellixError("INTERNAL_ERROR", "Account index out of range");
  }
}

/** Keypair for account `index`. The intermediate private key bytes are zeroed before returning. */
export function deriveKeypair(seed: Uint8Array, index: number): Keypair {
  assertAccountIndex(index);
  const node = HDKey.fromMasterSeed(seed).derive(`m/44'/148'/${String(index)}'`);
  const privateKey = node.privateKey;
  try {
    return Keypair.fromRawEd25519Seed(privateKey);
  } finally {
    privateKey.fill(0);
  }
}

export function derivePublicKey(seed: Uint8Array, index: number): string {
  return deriveKeypair(seed, index).publicKey();
}
