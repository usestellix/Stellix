import {
  Account,
  Asset,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk/base";
import { describe, expect, it } from "vitest";
import { decodeTransactionEnvelope } from "../decode/index.js";
import { spendsFromAccount } from "../involvement.js";

// Mode C's perspective (#35): does a pasted request act as the active account at all?

const user = Keypair.random();
const other = Keypair.random();
const third = Keypair.random().publicKey();

function inner(source: string) {
  const t = new TransactionBuilder(new Account(source, "1"), {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.payment({ destination: third, asset: Asset.native(), amount: "1" }))
    .setTimeout(180)
    .build();
  t.sign(Keypair.fromSecret(source === user.publicKey() ? user.secret() : other.secret()));
  return t;
}

const decode = (xdr: string) => decodeTransactionEnvelope(xdr, "testnet").decoded;

describe("spendsFromAccount", () => {
  it("true when the account is the transaction source", () => {
    expect(spendsFromAccount(decode(inner(user.publicKey()).toXdr()), user.publicKey())).toBe(true);
  });

  it("false when nothing in the request is the account", () => {
    expect(spendsFromAccount(decode(inner(other.publicKey()).toXdr()), user.publicKey())).toBe(
      false,
    );
  });

  it("true when the account only pays a fee bump's fee", () => {
    const bump = TransactionBuilder.buildFeeBumpTransaction(
      user.publicKey(),
      "200",
      inner(other.publicKey()),
      Networks.TESTNET,
    );
    expect(spendsFromAccount(decode(bump.toXdr()), user.publicKey())).toBe(true);
  });
});
