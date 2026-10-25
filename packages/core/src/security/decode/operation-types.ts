import type { DecodedText } from "../types.js";
import type {
  AccountFlag,
  DecodedAsset,
  DecodedClaimant,
  DecodedFlags,
  DecodedPoolShare,
  DecodedPrice,
  DecodedSignerKey,
  SponsoredEntry,
  TrustLineFlag,
} from "./value-types.js";

export type * from "./value-types.js";

// Decoded operation variants (SHIELD §3.1 decode/operations.ts), one per XDR operation type.
// `kind` and `opType` are the XDR OperationType name; `kind` discriminates the union.

interface OperationBase {
  /** The op's own source account (G… or M…) as written; null means the transaction's source. */
  source: string | null;
}

/**
 * An operation whose type has no decoder yet (SHIELD §9 S1); UNSUPPORTED_OP reports it.
 * `opType` is the XDR OperationType name, e.g. "invokeHostFunction".
 */
export interface UndecodedOperation extends OperationBase {
  kind: "undecoded";
  opType: string;
}

// Payments

export interface CreateAccountOperation extends OperationBase {
  kind: "createAccount";
  opType: "createAccount";
  /** G…. */
  destination: string;
  startingBalanceStroops: bigint;
}

export interface PaymentOperation extends OperationBase {
  kind: "payment";
  opType: "payment";
  /** G… or M…. */
  destination: string;
  asset: DecodedAsset;
  amountStroops: bigint;
}

export interface PathPaymentStrictReceiveOperation extends OperationBase {
  kind: "pathPaymentStrictReceive";
  opType: "pathPaymentStrictReceive";
  sendAsset: DecodedAsset;
  sendMaxStroops: bigint;
  /** G… or M…. */
  destination: string;
  destAsset: DecodedAsset;
  destAmountStroops: bigint;
  /** Intermediate assets, in order. */
  path: readonly DecodedAsset[];
}

export interface PathPaymentStrictSendOperation extends OperationBase {
  kind: "pathPaymentStrictSend";
  opType: "pathPaymentStrictSend";
  sendAsset: DecodedAsset;
  sendAmountStroops: bigint;
  /** G… or M…. */
  destination: string;
  destAsset: DecodedAsset;
  destMinStroops: bigint;
  /** Intermediate assets, in order. */
  path: readonly DecodedAsset[];
}

export interface AccountMergeOperation extends OperationBase {
  kind: "accountMerge";
  opType: "accountMerge";
  /** G… or M…: receives the source account's whole XLM balance. */
  destination: string;
}

// DEX and liquidity pools

export interface ManageSellOfferOperation extends OperationBase {
  kind: "manageSellOffer";
  opType: "manageSellOffer";
  selling: DecodedAsset;
  buying: DecodedAsset;
  /** Amount of `selling` offered; 0 deletes the offer. */
  amountStroops: bigint;
  /** Price of 1 unit of `selling` in units of `buying`. */
  price: DecodedPrice;
  /** 0 creates a new offer; otherwise the offer to update or delete. */
  offerId: bigint;
}

export interface ManageBuyOfferOperation extends OperationBase {
  kind: "manageBuyOffer";
  opType: "manageBuyOffer";
  selling: DecodedAsset;
  buying: DecodedAsset;
  /** Amount of `buying` wanted; 0 deletes the offer. */
  buyAmountStroops: bigint;
  /** Price of 1 unit of `buying` in units of `selling`. */
  price: DecodedPrice;
  /** 0 creates a new offer; otherwise the offer to update or delete. */
  offerId: bigint;
}

export interface CreatePassiveSellOfferOperation extends OperationBase {
  kind: "createPassiveSellOffer";
  opType: "createPassiveSellOffer";
  selling: DecodedAsset;
  buying: DecodedAsset;
  amountStroops: bigint;
  /** Price of 1 unit of `selling` in units of `buying`. */
  price: DecodedPrice;
}

export interface LiquidityPoolDepositOperation extends OperationBase {
  kind: "liquidityPoolDeposit";
  opType: "liquidityPoolDeposit";
  /** L…. */
  liquidityPoolId: string;
  maxAmountAStroops: bigint;
  maxAmountBStroops: bigint;
  /** Bounds on the deposit price, A in units of B. */
  minPrice: DecodedPrice;
  maxPrice: DecodedPrice;
}

export interface LiquidityPoolWithdrawOperation extends OperationBase {
  kind: "liquidityPoolWithdraw";
  opType: "liquidityPoolWithdraw";
  /** L…. */
  liquidityPoolId: string;
  /** Pool shares redeemed. */
  amountStroops: bigint;
  minAmountAStroops: bigint;
  minAmountBStroops: bigint;
}

// Account configuration

/** Every field is optional in XDR; null means "left unchanged". */
export interface SetOptionsOperation extends OperationBase {
  kind: "setOptions";
  opType: "setOptions";
  /** G…. */
  inflationDest: string | null;
  clearFlags: DecodedFlags<AccountFlag> | null;
  setFlags: DecodedFlags<AccountFlag> | null;
  masterWeight: number | null;
  lowThreshold: number | null;
  medThreshold: number | null;
  highThreshold: number | null;
  homeDomain: DecodedText | null;
  /** Adds the signer, changes its weight, or removes it (weight 0). */
  signer: { key: DecodedSignerKey; weight: number } | null;
}

export interface ManageDataOperation extends OperationBase {
  kind: "manageData";
  opType: "manageData";
  dataName: DecodedText;
  /** Null deletes the entry. */
  dataValue: DecodedText | null;
}

export interface BumpSequenceOperation extends OperationBase {
  kind: "bumpSequence";
  opType: "bumpSequence";
  bumpTo: bigint;
}

// Trust and issuer

export interface ChangeTrustOperation extends OperationBase {
  kind: "changeTrust";
  opType: "changeTrust";
  line: DecodedAsset | DecodedPoolShare;
  /** 0 removes the trustline. */
  limitStroops: bigint;
}

/** Deprecated by setTrustLineFlags, still valid. The asset's issuer is the op's source. */
export interface AllowTrustOperation extends OperationBase {
  kind: "allowTrust";
  opType: "allowTrust";
  /** G…. */
  trustor: string;
  assetCode: string;
  /** The authorization flags the trustline ends up with; the other authorization flag is cleared. */
  authorize: DecodedFlags<TrustLineFlag>;
}

export interface SetTrustLineFlagsOperation extends OperationBase {
  kind: "setTrustLineFlags";
  opType: "setTrustLineFlags";
  /** G…. */
  trustor: string;
  asset: DecodedAsset;
  clearFlags: DecodedFlags<TrustLineFlag>;
  setFlags: DecodedFlags<TrustLineFlag>;
}

export interface ClawbackOperation extends OperationBase {
  kind: "clawback";
  opType: "clawback";
  /** G… or M…: the account the asset is taken back from. */
  from: string;
  asset: DecodedAsset;
  amountStroops: bigint;
}

export interface ClawbackClaimableBalanceOperation extends OperationBase {
  kind: "clawbackClaimableBalance";
  opType: "clawbackClaimableBalance";
  /** B…. */
  balanceId: string;
}

// Claimable balances and sponsorship

export interface CreateClaimableBalanceOperation extends OperationBase {
  kind: "createClaimableBalance";
  opType: "createClaimableBalance";
  asset: DecodedAsset;
  amountStroops: bigint;
  claimants: readonly DecodedClaimant[];
}

export interface ClaimClaimableBalanceOperation extends OperationBase {
  kind: "claimClaimableBalance";
  opType: "claimClaimableBalance";
  /** B… StrKey. */
  balanceId: string;
}

export interface BeginSponsoringFutureReservesOperation extends OperationBase {
  kind: "beginSponsoringFutureReserves";
  opType: "beginSponsoringFutureReserves";
  /** G…: the account whose new entries the op source pays reserves for until the matching end. */
  sponsoredId: string;
}

export interface EndSponsoringFutureReservesOperation extends OperationBase {
  kind: "endSponsoringFutureReserves";
  opType: "endSponsoringFutureReserves";
}

export interface RevokeSponsorshipOperation extends OperationBase {
  kind: "revokeSponsorship";
  opType: "revokeSponsorship";
  entry: SponsoredEntry;
}

export type DecodedOperation =
  | UndecodedOperation
  | CreateAccountOperation
  | PaymentOperation
  | PathPaymentStrictReceiveOperation
  | PathPaymentStrictSendOperation
  | AccountMergeOperation
  | ManageSellOfferOperation
  | ManageBuyOfferOperation
  | CreatePassiveSellOfferOperation
  | LiquidityPoolDepositOperation
  | LiquidityPoolWithdrawOperation
  | SetOptionsOperation
  | ManageDataOperation
  | BumpSequenceOperation
  | ChangeTrustOperation
  | AllowTrustOperation
  | SetTrustLineFlagsOperation
  | ClawbackOperation
  | ClawbackClaimableBalanceOperation
  | CreateClaimableBalanceOperation
  | ClaimClaimableBalanceOperation
  | BeginSponsoringFutureReservesOperation
  | EndSponsoringFutureReservesOperation
  | RevokeSponsorshipOperation;
