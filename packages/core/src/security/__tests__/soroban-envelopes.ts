import {
  Account,
  Asset,
  Networks,
  Operation,
  StrKey,
  TransactionBuilder,
  type xdr,
} from "@stellar/stellar-sdk/base";

// Envelopes with Soroban ops and inflation, built with the SDK: Shield S1 only has to report
// them as unsupported, and testnet no longer accepts inflation, so no fixture can be captured.

export const SOURCE = "GB2UTPVMBMQSS64UB74V3AQVQAQWNQ225NIWCIKJ3B4XNSJB5NQJFJLJ";
const PEER = "GDX3XHNB6XNJBRMOWOP4ZQVKL5CFMXD4MJFXFICFVGR7J2KQXMDIANZD";

export const UNSUPPORTED_OPS: Record<string, () => xdr.Operation> = {
  invokeHostFunction: () =>
    Operation.invokeContractFunction({
      contract: StrKey.encodeContract(new Uint8Array(32).fill(3)),
      function: "transfer",
      args: [],
    }),
  extendFootprintTtl: () => Operation.extendFootprintTtl({ extendTo: 1000 }),
  restoreFootprint: () => Operation.restoreFootprint({}),
  inflation: () => Operation.inflation(),
};

export const payment = () =>
  Operation.payment({ destination: PEER, asset: Asset.native(), amount: "1" });

/** A testnet envelope with these ops, in order. */
export function envelopeWith(...ops: xdr.Operation[]): string {
  const builder = new TransactionBuilder(new Account(SOURCE, "1"), {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  }).setTimeout(180);
  for (const op of ops) builder.addOperation(op);
  return builder.build().toEnvelope().toXdr("base64");
}
