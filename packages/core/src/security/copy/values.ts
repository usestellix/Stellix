import type {
  AccountFlag,
  DecodedAsset,
  DecodedFlags,
  DecodedPrice,
  DecodedSignerKey,
  SponsoredEntry,
  TrustLineFlag,
} from "../decode/value-types.js";
import type { DecodedText } from "../types.js";
import { formatAssetWithIssuer, formatRatio, formatStroops } from "../rules/format.js";
import { STROOPS_PER_XLM } from "../../stellar/amount.js";

// Values as the operation descriptions and findings show them. Exact: amounts from bigint
// stroops, prices from their rationals, addresses in full (a look-alike can't hide in "G…X").

/** "12.5 XLM", "100 CLAW (GB77…)". */
export function amountText(stroops: bigint, asset: DecodedAsset): string {
  return `${formatStroops(stroops)} ${formatAssetWithIssuer(asset)}`;
}

/** "XLM" or the asset code alone: the unit in a price ("1.5 XLM per PLN"). */
export function assetCode(asset: DecodedAsset): string {
  return asset.type === "native" ? "XLM" : asset.code;
}

/** "1.5"; "about 0.3333333 (exactly 1/3)" when 7 decimals can't hold it; "n/d" when d ≤ 0. */
export function priceText(price: DecodedPrice): string {
  if (price.d <= 0n) return `${price.n.toString()}/${price.d.toString()}`;
  const decimal = formatRatio(price.n, price.d);
  return (price.n * STROOPS_PER_XLM) % price.d === 0n
    ? decimal
    : `about ${decimal} (exactly ${price.n.toString()}/${price.d.toString()})`;
}

/** Request text, quoted; bytes that aren't UTF-8 as hex. */
export function quotedText(text: DecodedText): string {
  return text.text === null ? `0x${text.hex}` : `"${text.text}"`;
}

/** Whose account an operation acts on: "your account", or the address as written. */
export function accountText(source: { isUser: boolean; address: string }): string {
  return source.isUser ? "your account" : source.address;
}

const ACCOUNT_FLAG_NAMES = {
  authRequired: "authorization required",
  authRevocable: "authorization revocable",
  authImmutable: "authorization immutable",
  authClawbackEnabled: "clawback enabled",
} as const satisfies Record<AccountFlag, string>;

const TRUSTLINE_FLAG_NAMES = {
  authorized: "authorized",
  authorizedToMaintainLiabilities: "authorized to maintain liabilities",
  trustlineClawbackEnabled: "clawback enabled",
} as const satisfies Record<TrustLineFlag, string>;

function flagsText<F extends string>(flags: DecodedFlags<F>, names: Record<F, string>): string {
  const parts = flags.flags.map((f) => names[f]);
  if (flags.unknownBits !== 0) parts.push(`unknown flag bits 0x${flags.unknownBits.toString(16)}`);
  return parts.length === 0 ? "no flags" : parts.join(", ");
}

export const accountFlagsText = (flags: DecodedFlags<AccountFlag>) =>
  flagsText(flags, ACCOUNT_FLAG_NAMES);
export const trustlineFlagsText = (flags: DecodedFlags<TrustLineFlag>) =>
  flagsText(flags, TRUSTLINE_FLAG_NAMES);

const SIGNER_TYPE_NAMES = {
  ed25519: "key",
  preAuthTx: "pre-authorized transaction",
  hashX: "hash",
  signedPayload: "signed payload",
} as const satisfies Record<DecodedSignerKey["type"], string>;

export function signerText(key: DecodedSignerKey): string {
  return `${SIGNER_TYPE_NAMES[key.type]} ${key.key}`;
}

/** A sponsored ledger entry, with its owner in full. */
export function entryText(entry: SponsoredEntry): string {
  switch (entry.type) {
    case "account":
      return `the account ${entry.accountId}`;
    case "trustline":
      return entry.asset.type === "poolShare"
        ? `the pool-share trustline ${entry.asset.liquidityPoolId} of ${entry.accountId}`
        : `the ${formatAssetWithIssuer(entry.asset)} trustline of ${entry.accountId}`;
    case "offer":
      return `offer ${entry.offerId.toString()} of ${entry.sellerId}`;
    case "data":
      return `the data entry ${quotedText(entry.dataName)} of ${entry.accountId}`;
    case "signer":
      return `the signer ${signerText(entry.signerKey)} on ${entry.accountId}`;
    case "claimableBalance":
      return `the claimable balance ${entry.balanceId}`;
    case "liquidityPool":
      return `the liquidity pool ${entry.liquidityPoolId}`;
  }
}
