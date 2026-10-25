import type { xdr } from "@stellar/stellar-sdk/base";
import type { DecodedOperation, UnsupportedOperation } from "./operation-types.js";
import {
  decodeAccountMerge,
  decodeCreateAccount,
  decodePathPaymentStrictReceive,
  decodePathPaymentStrictSend,
  decodePayment,
} from "./ops-payment.js";
import { decodeBumpSequence, decodeManageData, decodeSetOptions } from "./ops-account.js";
import { decodeClaimClaimableBalance, decodeCreateClaimableBalance } from "./ops-claimable.js";
import {
  decodeCreatePassiveSellOffer,
  decodeLiquidityPoolDeposit,
  decodeLiquidityPoolWithdraw,
  decodeManageBuyOffer,
  decodeManageSellOffer,
} from "./ops-dex.js";
import { decodeBeginSponsoring, decodeRevokeSponsorship } from "./ops-sponsorship.js";
import {
  decodeAllowTrust,
  decodeChangeTrust,
  decodeClawback,
  decodeClawbackClaimableBalance,
  decodeSetTrustLineFlags,
} from "./ops-trust.js";
import { muxedAddress } from "./xdr-values.js";

// Every classic op → DecodedOperation (SHIELD §3.1, §9 S1). Soroban ops and inflation become
// "unsupported", which UNSUPPORTED_OP reports: nothing is ever silently dropped.

function unsupported(
  opType: string,
  reason: UnsupportedOperation["reason"],
  source: string | null,
): UnsupportedOperation {
  return { kind: "unsupported", opType, reason, source };
}

export function decodeOperation(op: xdr.Operation): DecodedOperation {
  const source = op.sourceAccount === null ? null : muxedAddress(op.sourceAccount);
  const body = op.body;
  switch (body.type) {
    case "createAccount":
      return decodeCreateAccount(body.createAccountOp, source);
    case "payment":
      return decodePayment(body.paymentOp, source);
    case "pathPaymentStrictReceive":
      return decodePathPaymentStrictReceive(body.pathPaymentStrictReceiveOp, source);
    case "pathPaymentStrictSend":
      return decodePathPaymentStrictSend(body.pathPaymentStrictSendOp, source);
    case "accountMerge":
      return decodeAccountMerge(body.destination, source);
    case "manageSellOffer":
      return decodeManageSellOffer(body.manageSellOfferOp, source);
    case "manageBuyOffer":
      return decodeManageBuyOffer(body.manageBuyOfferOp, source);
    case "createPassiveSellOffer":
      return decodeCreatePassiveSellOffer(body.createPassiveSellOfferOp, source);
    case "liquidityPoolDeposit":
      return decodeLiquidityPoolDeposit(body.liquidityPoolDepositOp, source);
    case "liquidityPoolWithdraw":
      return decodeLiquidityPoolWithdraw(body.liquidityPoolWithdrawOp, source);
    case "setOptions":
      return decodeSetOptions(body.setOptionsOp, source);
    case "manageData":
      return decodeManageData(body.manageDataOp, source);
    case "bumpSequence":
      return decodeBumpSequence(body.bumpSequenceOp, source);
    case "changeTrust":
      return decodeChangeTrust(body.changeTrustOp, source);
    case "allowTrust":
      return decodeAllowTrust(body.allowTrustOp, source);
    case "setTrustLineFlags":
      return decodeSetTrustLineFlags(body.setTrustLineFlagsOp, source);
    case "clawback":
      return decodeClawback(body.clawbackOp, source);
    case "clawbackClaimableBalance":
      return decodeClawbackClaimableBalance(body.clawbackClaimableBalanceOp, source);
    case "createClaimableBalance":
      return decodeCreateClaimableBalance(body.createClaimableBalanceOp, source);
    case "claimClaimableBalance":
      return decodeClaimClaimableBalance(body.claimClaimableBalanceOp, source);
    case "beginSponsoringFutureReserves":
      return decodeBeginSponsoring(body.beginSponsoringFutureReservesOp, source);
    case "endSponsoringFutureReserves":
      return {
        kind: "endSponsoringFutureReserves",
        opType: "endSponsoringFutureReserves",
        source,
      };
    case "revokeSponsorship":
      return (
        decodeRevokeSponsorship(body.revokeSponsorshipOp, source) ??
        unsupported(body.type, "soroban", source)
      );
    case "invokeHostFunction":
    case "extendFootprintTtl":
    case "restoreFootprint":
      return unsupported(body.type, "soroban", source);
    case "inflation":
      return unsupported(body.type, "obsolete", source);
    default: {
      // Unreachable with this SDK (its parser rejects unknown op types), and a compile error
      // when an SDK upgrade adds one. Kept so a new op type is reported, never dropped.
      const unknown: never = body;
      return unsupported(String((unknown as { type: unknown }).type), "unknown", source);
    }
  }
}
