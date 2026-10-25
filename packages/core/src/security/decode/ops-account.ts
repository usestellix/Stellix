import type { xdr } from "@stellar/stellar-sdk/base";
import { decodeFlags, decodeSignerKey } from "./assets.js";
import type {
  BumpSequenceOperation,
  ManageDataOperation,
  SetOptionsOperation,
} from "./operation-types.js";
import { ACCOUNT_FLAGS } from "./value-types.js";
import { accountAddress, decodeText } from "./xdr-values.js";

// setOptions, manageData and bumpSequence.

export function decodeSetOptions(op: xdr.SetOptionsOp, source: string | null): SetOptionsOperation {
  return {
    kind: "setOptions",
    opType: "setOptions",
    source,
    inflationDest: op.inflationDest === null ? null : accountAddress(op.inflationDest),
    clearFlags: op.clearFlags === null ? null : decodeFlags(op.clearFlags, ACCOUNT_FLAGS),
    setFlags: op.setFlags === null ? null : decodeFlags(op.setFlags, ACCOUNT_FLAGS),
    masterWeight: op.masterWeight,
    lowThreshold: op.lowThreshold,
    medThreshold: op.medThreshold,
    highThreshold: op.highThreshold,
    homeDomain: op.homeDomain === null ? null : decodeText(op.homeDomain.bytes),
    signer:
      op.signer === null ? null : { key: decodeSignerKey(op.signer.key), weight: op.signer.weight },
  };
}

export function decodeManageData(op: xdr.ManageDataOp, source: string | null): ManageDataOperation {
  return {
    kind: "manageData",
    opType: "manageData",
    source,
    dataName: decodeText(op.dataName.bytes),
    dataValue: op.dataValue === null ? null : decodeText(op.dataValue.value),
  };
}

export function decodeBumpSequence(
  op: xdr.BumpSequenceOp,
  source: string | null,
): BumpSequenceOperation {
  return { kind: "bumpSequence", opType: "bumpSequence", source, bumpTo: op.bumpTo };
}
