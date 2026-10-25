import { sha256 } from "@noble/hashes/sha2.js";
import { SignerKey, StrKey, type xdr } from "@stellar/stellar-sdk/base";
import { assertNever } from "../../assert-never.js";
import type {
  DecodedAsset,
  DecodedFlags,
  DecodedPoolShare,
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

function creditAsset(asset: CreditAsset | xdr.TrustLineAsset | xdr.ChangeTrustAsset): DecodedAsset {
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

/** allowTrust names only the code; the issuer is the op's source. */
export function decodeAssetCode(code: xdr.AssetCode): string {
  return code.type === "assetTypeCreditAlphanum4"
    ? assetCode(code.assetCode4.value, 1)
    : assetCode(code.assetCode12.value, 5);
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

/** changeTrust's line: an asset, or a pool given by its parameters (CAP-38). */
export function decodeChangeTrustAsset(
  asset: xdr.ChangeTrustAsset,
): DecodedAsset | DecodedPoolShare {
  switch (asset.type) {
    case "assetTypeNative":
      return { type: "native" };
    case "assetTypePoolShare": {
      const params = asset.liquidityPool.constantProduct;
      return {
        type: "poolShare",
        // A pool's ID is the sha256 of its parameters, as the pool's own ops reference it.
        liquidityPoolId: StrKey.encodeLiquidityPool(sha256(asset.liquidityPool.toXdr())),
        assetA: decodeAsset(params.assetA),
        assetB: decodeAsset(params.assetB),
        feeBps: params.fee,
      };
    }
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

/** Splits a bitmask into the names in `defs`; bits no name defines are kept in unknownBits. */
export function decodeFlags<F extends string>(
  bits: number,
  defs: Readonly<Record<F, number>>,
): DecodedFlags<F> {
  const flags = (Object.keys(defs) as F[]).filter((name) => (bits & defs[name]) !== 0);
  const known = flags.reduce((acc, name) => acc | defs[name], 0);
  return { flags, unknownBits: (bits & ~known) >>> 0 };
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
