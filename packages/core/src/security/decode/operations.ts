import type { xdr } from "@stellar/stellar-sdk/base";
import type { DecodedOperation } from "../types.js";
import { muxedAddress } from "./xdr-values.js";

// Every classic op → DecodedOperation (SHIELD §3.1). Op types without a decoder yet stay
// "undecoded" so UNSUPPORTED_OP reports them instead of anything being silently shown.

export function decodeOperation(op: xdr.Operation): DecodedOperation {
  const source = op.sourceAccount === null ? null : muxedAddress(op.sourceAccount);
  return { kind: "undecoded", opType: op.body.type, source };
}
