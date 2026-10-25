import type { DecodedAsset, DecodedClaimant, SponsoredEntry } from "./value-types.js";

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
  | CreateClaimableBalanceOperation
  | ClaimClaimableBalanceOperation
  | BeginSponsoringFutureReservesOperation
  | EndSponsoringFutureReservesOperation
  | RevokeSponsorshipOperation;
