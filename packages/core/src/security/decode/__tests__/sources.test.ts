import { Asset, MuxedAccount, Account, Operation, xdr } from "@stellar/stellar-sdk/base";
import { describe, expect, it } from "vitest";
import { fixture } from "../../__fixtures__/load.js";
import { decodeTransactionEnvelope } from "../envelope.js";
import { resolveSources } from "../sources.js";
import { PEER, USER } from "./helpers.js";

// SHIELD §6.6. The fixtures are real testnet transactions; Horizon's record of each gives the
// transaction source, its muxed form and the fee account independently of our decoder.

function decoded(name: string) {
  return decodeTransactionEnvelope(fixture(name).envelopeXdr, "testnet").decoded;
}

const PAYMENT = () => Operation.payment({ destination: PEER, asset: Asset.native(), amount: "1" });

/** payment-native's transaction (source: USER) with `ops`, decoded. */
function txWith(...ops: xdr.Operation[]) {
  const t = xdr.TransactionEnvelope.fromXdr(fixture("payment-native").envelopeXdr, "base64");
  if (t.type !== "envelopeTypeTx") throw new Error("expected v1");
  const { sourceAccount, fee, seqNum, cond, memo, ext } = t.v1.tx;
  const tx = new xdr.Transaction({ sourceAccount, fee, seqNum, cond, memo, operations: ops, ext });
  const env = xdr.TransactionEnvelope.envelopeTypeTx(
    new xdr.TransactionV1Envelope({ tx, signatures: [] }),
  );
  return decodeTransactionEnvelope(env.toXdr("base64"), "testnet").decoded;
}

describe("resolveSources", () => {
  it("op source absent: the op inherits the transaction's source", () => {
    const s = resolveSources(txWith(PAYMENT()), USER);
    expect(s.ops).toEqual([{ address: USER, account: USER, isUser: true, explicit: false }]);
  });

  it("op source present: the op's own source wins over the transaction's", () => {
    const s = resolveSources(
      txWith(
        Operation.payment({ source: PEER, destination: USER, asset: Asset.native(), amount: "1" }),
      ),
      USER,
    );
    expect(s.tx).toEqual({ address: USER, account: USER, isUser: true });
    expect(s.ops).toEqual([{ address: PEER, account: PEER, isUser: false, explicit: true }]);
  });

  it("muxed transaction source and muxed op source resolve to their base accounts", () => {
    const d = decoded("payment-muxed-sources");
    const h = fixture("payment-muxed-sources").transaction.body;
    expect(d.source).toBe(h.account_muxed);
    const s = resolveSources(d, USER);
    expect(s.tx).toEqual({ address: h.account_muxed, account: h.source_account, isUser: true });
    expect(s.fee).toEqual(s.tx);
    const [paid] = s.ops;
    expect(paid?.address).toMatch(/^M/);
    expect(paid).toMatchObject({ account: PEER, isUser: false, explicit: true });
  });

  it("marks the user as an op source inside someone else's transaction", () => {
    // The same captured transaction, seen from the peer's wallet: the transaction is the other
    // account's (muxed USER), and the peer's muxed account is the op's source.
    const s = resolveSources(decoded("payment-muxed-sources"), PEER);
    expect(s.tx.isUser).toBe(false);
    expect(s.ops.map((o) => o.isUser)).toEqual([true]);
  });

  it("sponsorship sandwich: only the op sourced by the sponsored account is theirs", () => {
    const d = decoded("sponsorship-create-account");
    const end = d.operations[2];
    if (end?.source === null || end === undefined) throw new Error("expected an explicit source");
    const s = resolveSources(d, end.source);
    expect(s.tx.isUser).toBe(false);
    expect(s.ops.map((o) => o.isUser)).toEqual([false, false, true]);
    expect(s.ops.map((o) => o.explicit)).toEqual([false, false, true]);
  });

  it("fee bump: ops take the inner source; the fee source only pays the fee", () => {
    const d = decoded("feeBump");
    const h = fixture("feeBump").transaction.body;
    expect(h.fee_account).toBe(PEER);
    expect(h.source_account).toBe(USER);

    const asUser = resolveSources(d, USER);
    expect(asUser.tx).toEqual({ address: USER, account: USER, isUser: true });
    expect(asUser.fee).toEqual({ address: PEER, account: PEER, isUser: false });
    expect(asUser.ops.every((o) => o.isUser && !o.explicit)).toBe(true);

    // The fee payer's wallet: it pays the fee, but none of the ops are its own.
    const asPeer = resolveSources(d, PEER);
    expect(asPeer.fee.isUser).toBe(true);
    expect(asPeer.tx.isUser).toBe(false);
    expect(asPeer.ops.some((o) => o.isUser)).toBe(false);
  });

  it("a muxed user account is compared by its base account", () => {
    const mUser = new MuxedAccount(new Account(USER, "0"), "7").accountId();
    expect(resolveSources(txWith(PAYMENT()), mUser).ops[0]?.isUser).toBe(true);
  });
});
