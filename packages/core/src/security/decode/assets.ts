import { SignerKey, type xdr } from "@stellar/stellar-sdk/base";
import { assertNever } from "../../assert-never.js";
import type {
  DecodedAsset,
  DecodedPrice,
  DecodedSignerKey,
  DecodedTrustLineAsset,
} from "./value-types.js";
import { accountAddress, invalidInput, liquidityPoolAddress } from "./xdr-values.js";

// Assets, prices, flags and signer keys, shared by the op decoders.

/**
 * stellar-core's isAssetValid: ASCII letters and digits, zero bytes only as trailing padding,
 * at least `minChars` characters (1 for alphanum4, 5 for alphanum12). Anything else would be
 * rejected by the network, and could render misleadingly, so it fails decoding.
 */
function assetCode(bytes: Uint8Array, minChars: number): string {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  const code = String.fromCharCode(...bytes.subarray(0, end));
  if (code.length < minChars || !/^[A-Za-z0-9]+$/.test(code)) {
    throw invalidInput("Invalid asset code");
  }
  return code;
}

type CreditAsset = xdr.AssetCreditAlphanum4 | xdr.AssetCreditAlphanum12;

function creditAsset(asset: CreditAsset | xdr.TrustLineAsset): DecodedAsset {
  if (asset.type === "assetTypeCreditAlphanum4") {
    const { assetCode: code, issuer } = asset.alphaNum4;
    return { type: "credit", code: assetCode(code.value, 1), issuer: accountAddress(issuer) };
  }
  if (asset.type === "assetTypeCreditAlphanum12") {
    const { assetCode: code, issuer } = asset.alphaNum12;
    return { type: "credit", code: assetCode(code.value, 5), issuer: accountAddress(issuer) };
  }
  throw invalidInput("Not a credit asset");
}

export function decodeAsset(asset: xdr.Asset): DecodedAsset {
  return asset.type === "assetTypeNative" ? { type: "native" } : creditAsset(asset);
}

export function decodeTrustLineAsset(asset: xdr.TrustLineAsset): DecodedTrustLineAsset {
  switch (asset.type) {
    case "assetTypeNative":
      return { type: "native" };
    case "assetTypePoolShare":
      return { type: "poolShare", liquidityPoolId: liquidityPoolAddress(asset.liquidityPoolId) };
    case "assetTypeCreditAlphanum4":
    case "assetTypeCreditAlphanum12":
      return creditAsset(asset);
    default:
      return assertNever(asset);
  }
}

export function decodePrice(price: xdr.Price): DecodedPrice {
  return { n: BigInt(price.n), d: BigInt(price.d) };
}

const SIGNER_KEY_TYPES = {
  signerKeyTypeEd25519: "ed25519",
  signerKeyTypePreAuthTx: "preAuthTx",
  signerKeyTypeHashX: "hashX",
  signerKeyTypeEd25519SignedPayload: "signedPayload",
} as const satisfies Record<xdr.SignerKey["type"], DecodedSignerKey["type"]>;

export function decodeSignerKey(key: xdr.SignerKey): DecodedSignerKey {
  return { type: SIGNER_KEY_TYPES[key.type], key: SignerKey.encodeSignerKey(key) };
}
