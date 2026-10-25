import type { xdr } from "@stellar/stellar-sdk/base";
import type { DecodedOperation } from "./operation-types.js";
import { decodeClaimClaimableBalance, decodeCreateClaimableBalance } from "./ops-claimable.js";
import { decodeBeginSponsoring, decodeRevokeSponsorship } from "./ops-sponsorship.js";
import { muxedAddress } from "./xdr-values.js";

// Every classic op → DecodedOperation (SHIELD §3.1). Op types without a decoder yet stay
// "undecoded" so UNSUPPORTED_OP reports them instead of anything being silently shown.

export function decodeOperation(op: xdr.Operation): DecodedOperation {
  const source = op.sourceAccount === null ? null : muxedAddress(op.sourceAccount);
  const body = op.body;
  switch (body.type) {
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
