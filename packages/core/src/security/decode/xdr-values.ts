import { hex } from "@scure/base";
import { encodeMuxedAccountToAddress, StrKey, type xdr } from "@stellar/stellar-sdk/base";
import { StellixError } from "../../errors.js";
import type { DecodedText } from "../types.js";

// Shared conversions from parsed XDR values to the public strings in DecodedRequest.

/** Decoding failed on structure the network would also reject. Never echoes the input. */
export function invalidInput(message: string): StellixError {
  return new StellixError("SHIELD_INPUT_INVALID", message);
}

export function accountAddress(key: xdr.PublicKey): string {
  return StrKey.encodeEd25519PublicKey(key.ed25519.value);
}

/** G… for a plain account, M… for a muxed one. */
export function muxedAddress(account: xdr.MuxedAccount): string {
  return encodeMuxedAccountToAddress(account);
}

export function decodeText(bytes: Uint8Array): DecodedText {
  let text: string | null;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = null;
  }
  return { text, hex: hex.encode(bytes) };
}

export function bytesHex(bytes: Uint8Array): string {
  return hex.encode(bytes);
}

/** L… StrKey of a liquidity pool. */
export function liquidityPoolAddress(poolId: xdr.PoolId): string {
  return StrKey.encodeLiquidityPool(poolId.value);
}

/** B… StrKey: the id's type byte (only v0 exists) followed by its hash. */
export function claimableBalanceAddress(id: xdr.ClaimableBalanceId): string {
  return StrKey.encodeClaimableBalance(new Uint8Array([0, ...id.v0.value]));
}
