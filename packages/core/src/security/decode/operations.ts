import type { xdr } from "@stellar/stellar-sdk/base";
import type { DecodedOperation } from "./operation-types.js";
import {
  decodeAccountMerge,
  decodeCreateAccount,
  decodePathPaymentStrictReceive,
  decodePathPaymentStrictSend,
  decodePayment,
} from "./ops-payment.js";
import { decodeClaimClaimableBalance, decodeCreateClaimableBalance } from "./ops-claimable.js";
import {
  decodeCreatePassiveSellOffer,
  decodeLiquidityPoolDeposit,
  decodeLiquidityPoolWithdraw,
  decodeManageBuyOffer,
  decodeManageSellOffer,
} from "./ops-dex.js";
import { decodeBeginSponsoring, decodeRevokeSponsorship } from "./ops-sponsorship.js";
import { muxedAddress } from "./xdr-values.js";

// Every classic op → DecodedOperation (SHIELD §3.1). Op types without a decoder yet stay
// "undecoded" so UNSUPPORTED_OP reports them instead of anything being silently shown.

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
        decodeRevokeSponsorship(body.revokeSponsorshipOp, source) ?? {
          kind: "undecoded",
          opType: body.type,
          source,
        }
      );
    default:
      return { kind: "undecoded", opType: body.type, source };
  }
}
