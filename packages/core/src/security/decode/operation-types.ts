import type { DecodedText } from "../types.js";

// Decoded operation variants (SHIELD §3.1 decode/operations.ts). Addresses are StrKey strings;
// money is bigint stroops. Each decoder issue adds its variants to DecodedOperation.

export type DecodedAsset = { type: "native" } | { type: "credit"; code: string; issuer: string };

export type DecodedTrustLineAsset =
  | DecodedAsset
  /** `liquidityPoolId` is the pool's L… StrKey. */
  | { type: "poolShare"; liquidityPoolId: string };

/**
 * When a claimant may claim (CAP-23). Relative times count from the balance's creation.
 * The decoder enforces what stellar-core does: and/or take exactly two, not takes one,
 * times are non-negative, nesting is at most 4 deep.
 */
export type DecodedClaimPredicate =
  | { type: "unconditional" }
  | { type: "and"; predicates: readonly [DecodedClaimPredicate, DecodedClaimPredicate] }
  | { type: "or"; predicates: readonly [DecodedClaimPredicate, DecodedClaimPredicate] }
  | { type: "not"; predicate: DecodedClaimPredicate }
  | { type: "beforeAbsoluteTime"; epochSeconds: bigint }
  | { type: "beforeRelativeTime"; seconds: bigint };

export interface DecodedClaimant {
  /** G…. */
  destination: string;
  predicate: DecodedClaimPredicate;
}

/** `key` is the signer's StrKey: G… ed25519, T… pre-auth tx, X… hash(x), P… signed payload. */
export interface DecodedSignerKey {
  type: "ed25519" | "preAuthTx" | "hashX" | "signedPayload";
  key: string;
}

/** What a revokeSponsorship targets: one ledger entry, or one signer on an account. */
export type SponsoredEntry =
  | { type: "account"; accountId: string }
  | { type: "trustline"; accountId: string; asset: DecodedTrustLineAsset }
  | { type: "offer"; sellerId: string; offerId: bigint }
  | { type: "data"; accountId: string; dataName: DecodedText }
  /** `balanceId` is the balance's B… StrKey. */
  | { type: "claimableBalance"; balanceId: string }
  | { type: "liquidityPool"; liquidityPoolId: string }
  | { type: "signer"; accountId: string; signerKey: DecodedSignerKey };

interface OperationBase {
  /** The op's own source account (G… or M…) as written; null means the transaction's source. */
  source: string | null;
}

/**
 * An operation whose type has no decoder yet (SHIELD §9 S1); UNSUPPORTED_OP reports it.
 * `opType` is the XDR OperationType name, e.g. "payment", "invokeHostFunction".
 */
export interface UndecodedOperation extends OperationBase {
  kind: "undecoded";
  opType: string;
}

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
  | CreateClaimableBalanceOperation
  | ClaimClaimableBalanceOperation
  | BeginSponsoringFutureReservesOperation
  | EndSponsoringFutureReservesOperation
  | RevokeSponsorshipOperation;
