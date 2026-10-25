import type { xdr } from "@stellar/stellar-sdk/base";
import { decodeAsset, decodeAssetCode, decodeChangeTrustAsset, decodeFlags } from "./assets.js";
import type {
  AllowTrustOperation,
  ChangeTrustOperation,
  ClawbackClaimableBalanceOperation,
  ClawbackOperation,
  SetTrustLineFlagsOperation,
} from "./operation-types.js";
import { TRUSTLINE_FLAGS } from "./value-types.js";
import { accountAddress, claimableBalanceAddress, muxedAddress } from "./xdr-values.js";

// changeTrust, and the issuer ops: allowTrust, setTrustLineFlags, clawback,
// clawbackClaimableBalance.

export function decodeChangeTrust(
  op: xdr.ChangeTrustOp,
  source: string | null,
): ChangeTrustOperation {
  return {
    kind: "changeTrust",
    opType: "changeTrust",
    source,
    line: decodeChangeTrustAsset(op.line),
    limitStroops: op.limit,
  };
}

export function decodeAllowTrust(op: xdr.AllowTrustOp, source: string | null): AllowTrustOperation {
  return {
    kind: "allowTrust",
    opType: "allowTrust",
    source,
    trustor: accountAddress(op.trustor),
    assetCode: decodeAssetCode(op.asset),
    authorize: decodeFlags(op.authorize, TRUSTLINE_FLAGS),
  };
}

export function decodeSetTrustLineFlags(
  op: xdr.SetTrustLineFlagsOp,
  source: string | null,
): SetTrustLineFlagsOperation {
  return {
    kind: "setTrustLineFlags",
    opType: "setTrustLineFlags",
    source,
    trustor: accountAddress(op.trustor),
    asset: decodeAsset(op.asset),
    clearFlags: decodeFlags(op.clearFlags, TRUSTLINE_FLAGS),
    setFlags: decodeFlags(op.setFlags, TRUSTLINE_FLAGS),
  };
}

export function decodeClawback(op: xdr.ClawbackOp, source: string | null): ClawbackOperation {
  return {
    kind: "clawback",
    opType: "clawback",
    source,
    from: muxedAddress(op.from),
    asset: decodeAsset(op.asset),
    amountStroops: op.amount,
  };
}

export function decodeClawbackClaimableBalance(
  op: xdr.ClawbackClaimableBalanceOp,
  source: string | null,
): ClawbackClaimableBalanceOperation {
  return {
    kind: "clawbackClaimableBalance",
    opType: "clawbackClaimableBalance",
    source,
    balanceId: claimableBalanceAddress(op.balanceId),
  };
}
