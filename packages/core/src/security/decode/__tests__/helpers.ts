import { StrKey, xdr } from "@stellar/stellar-sdk/base";
import { expect } from "vitest";
import { fixture } from "../../__fixtures__/load.js";
import { decodeTransactionEnvelope } from "../envelope.js";
import type { DecodedOperation } from "../operation-types.js";

// Shared by the decoder tests. Fixture accounts are the ones the capture script funded.

export const USER = "GB2UTPVMBMQSS64UB74V3AQVQAQWNQ225NIWCIKJ3B4XNSJB5NQJFJLJ";
export const PEER = "GDX3XHNB6XNJBRMOWOP4ZQVKL5CFMXD4MJFXFICFVGR7J2KQXMDIANZD";
export const SPONSORED = "GBVUE57PFI4Z37X2R6X2IKKQ2BIQCKFFARLG2SWIBK22CKPARHUAEFEM";
export const PLN_ISSUER = "GDTXBCKMQ7N5CYELJ64XADA6F2AXKJSRLKDZSBVWQ3LI5ER6VAJZMI54";
export const CLAW_ISSUER = "GB77DTQJGHZQSO66DAVOGHPJNIYTDHBIE2CGLDXYZEEVZZU4RAQY4WIH";
export const PLN = { type: "credit", code: "PLN", issuer: PLN_ISSUER } as const;
export const CLAW = { type: "credit", code: "CLAW", issuer: CLAW_ISSUER } as const;
/** The native/PLN pool (fee 30) the fixtures deposit into. */
export const POOL_ID = "LA7BNCCF2M2JOVUF6ZDZ3ZIQSOCT3AFYYM3RIX7AT4F44FGXEJAX5KJW";

export const invalid = expect.objectContaining({ code: "SHIELD_INPUT_INVALID" }) as Error;

export function ops(name: string): readonly DecodedOperation[] {
  return decodeTransactionEnvelope(fixture(name).envelopeXdr, "testnet").decoded.operations;
}

export function op(name: string, index = 0): DecodedOperation {
  const o = ops(name)[index];
  if (o === undefined) throw new Error(`${name} has no op ${String(index)}`);
  return o;
}

function v1Tx(name: string): xdr.Transaction {
  const env = xdr.TransactionEnvelope.fromXdr(fixture(name).envelopeXdr, "base64");
  if (env.type !== "envelopeTypeTx") throw new Error(`${name} is not a v1 envelope`);
  return env.v1.tx;
}

/** The SDK's own JSON (SEP-51) for a fixture op: an encoder independent of ours. */
export function sdkJson(name: string, index = 0): unknown {
  return v1Tx(name).operations[index]?.body.toJSON();
}

/** payment-native's transaction with its operations replaced by `bodies`, decoded. */
export function decodeWith(...bodies: xdr.OperationBody[]): readonly DecodedOperation[] {
  const t = v1Tx("payment-native");
  const tx = new xdr.Transaction({
    sourceAccount: t.sourceAccount,
    fee: t.fee,
    seqNum: t.seqNum,
    cond: t.cond,
    memo: t.memo,
    operations: bodies.map((body) => new xdr.Operation({ sourceAccount: null, body })),
    ext: t.ext,
  });
  const xdrBase64 = xdr.TransactionEnvelope.envelopeTypeTx(
    new xdr.TransactionV1Envelope({ tx, signatures: [] }),
  ).toXdr("base64");
  return decodeTransactionEnvelope(xdrBase64, "testnet").decoded.operations;
}

export const pk = (address: string) =>
  xdr.PublicKey.publicKeyTypeEd25519(StrKey.decodeEd25519PublicKey(address));

export const ascii = (s: string, size: number) => {
  const out = new Uint8Array(size);
  out.set(Array.from(s, (c) => c.charCodeAt(0)));
  return out;
};
