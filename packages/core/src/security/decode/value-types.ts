import type { DecodedText } from "../types.js";

// Values that decoded operations share. Addresses are StrKey strings. Amounts named `…Stroops`
// are XDR int64 amounts: 10⁻⁷ units of their asset (stroops for XLM), always bigint.

export type DecodedAsset = { type: "native" } | { type: "credit"; code: string; issuer: string };

export type DecodedTrustLineAsset =
  | DecodedAsset
  /** `liquidityPoolId` is the pool's L… StrKey. */
  | { type: "poolShare"; liquidityPoolId: string };

/** A pool-share trustline as changeTrust writes it: the pool's parameters and derived ID. */
export interface DecodedPoolShare {
  type: "poolShare";
  /** L… StrKey: sha256 of the pool parameters, the ID the pool's ops use. */
  liquidityPoolId: string;
  assetA: DecodedAsset;
  assetB: DecodedAsset;
  /** The pool's fee in basis points (30 for every pool today). */
  feeBps: number;
}

/**
 * An exact rational price (n/d), as written; never converted to a float. The decoder doesn't
 * reject non-positive values (stellar-core does), so a rule must not divide by `d` unchecked.
 */
export interface DecodedPrice {
  n: bigint;
  d: bigint;
}

/** Account flags (XDR AccountFlags). */
export const ACCOUNT_FLAGS = {
  authRequired: 0x1,
  authRevocable: 0x2,
  authImmutable: 0x4,
  authClawbackEnabled: 0x8,
} as const;
export type AccountFlag = keyof typeof ACCOUNT_FLAGS;

/** Trustline flags (XDR TrustLineFlags). */
export const TRUSTLINE_FLAGS = {
  authorized: 0x1,
  authorizedToMaintainLiabilities: 0x2,
  trustlineClawbackEnabled: 0x4,
} as const;
export type TrustLineFlag = keyof typeof TRUSTLINE_FLAGS;

/** A flag bitmask: the named flags it sets, and any bits no flag defines (shown, never hidden). */
export interface DecodedFlags<F extends string> {
  flags: readonly F[];
  unknownBits: number;
}

/** `key` is the signer's StrKey: G… ed25519, T… pre-auth tx, X… hash(x), P… signed payload. */
export interface DecodedSignerKey {
  type: "ed25519" | "preAuthTx" | "hashX" | "signedPayload";
  key: string;
}

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
