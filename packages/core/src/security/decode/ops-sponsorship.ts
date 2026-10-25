import type { xdr } from "@stellar/stellar-sdk/base";
import { decodeSignerKey, decodeTrustLineAsset } from "./assets.js";
import type {
  BeginSponsoringFutureReservesOperation,
  RevokeSponsorshipOperation,
  SponsoredEntry,
} from "./operation-types.js";
import {
  accountAddress,
  claimableBalanceAddress,
  decodeText,
  liquidityPoolAddress,
} from "./xdr-values.js";

// beginSponsoringFutureReserves and revokeSponsorship (CAP-33). endSponsoringFutureReserves has
// no body and is built in operations.ts.

export function decodeBeginSponsoring(
  op: xdr.BeginSponsoringFutureReservesOp,
  source: string | null,
): BeginSponsoringFutureReservesOperation {
  return {
    kind: "beginSponsoringFutureReserves",
    opType: "beginSponsoringFutureReserves",
    source,
    sponsoredId: accountAddress(op.sponsoredId),
  };
}

/** Null for the Soroban ledger keys, which have no classic sponsorship to revoke. */
function sponsoredEntry(op: xdr.RevokeSponsorshipOp): SponsoredEntry | null {
  if (op.type === "revokeSponsorshipSigner") {
    const { accountId, signerKey } = op.signer;
    return {
      type: "signer",
      accountId: accountAddress(accountId),
      signerKey: decodeSignerKey(signerKey),
    };
  }
  const key = op.ledgerKey;
  switch (key.type) {
    case "account":
      return { type: "account", accountId: accountAddress(key.account.accountId) };
    case "trustline":
      return {
        type: "trustline",
        accountId: accountAddress(key.trustLine.accountId),
        asset: decodeTrustLineAsset(key.trustLine.asset),
      };
    case "offer":
      return {
        type: "offer",
        sellerId: accountAddress(key.offer.sellerId),
        offerId: key.offer.offerId,
      };
    case "data":
      return {
        type: "data",
        accountId: accountAddress(key.data.accountId),
        dataName: decodeText(key.data.dataName.bytes),
      };
    case "claimableBalance":
      return {
        type: "claimableBalance",
        balanceId: claimableBalanceAddress(key.claimableBalance.balanceId),
      };
    case "liquidityPool":
      return {
        type: "liquidityPool",
        liquidityPoolId: liquidityPoolAddress(key.liquidityPool.liquidityPoolId),
      };
    case "contractData":
    case "contractCode":
    case "configSetting":
    case "ttl":
      return null;
  }
}

/** Null when the target is a Soroban ledger key: the op stays undecoded (UNSUPPORTED_OP). */
export function decodeRevokeSponsorship(
  op: xdr.RevokeSponsorshipOp,
  source: string | null,
): RevokeSponsorshipOperation | null {
  const entry = sponsoredEntry(op);
  return entry === null
    ? null
    : { kind: "revokeSponsorship", opType: "revokeSponsorship", source, entry };
}
