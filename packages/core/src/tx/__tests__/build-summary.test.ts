import {
  Account,
  Asset,
  Keypair,
  Memo,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk/base";
import { describe, expect, it } from "vitest";
import { NETWORKS } from "../../network/config.js";
import { buildPaymentTransaction, rehydrateTransaction, transactionHashHex } from "../build.js";
import { assertSameSummary, summarizeTransaction } from "../summary.js";
import { testAddresses } from "./addresses.js";

const { source, dest, muxedDest } = testAddresses();
const TESTNET = NETWORKS.testnet.passphrase;
const ctx = {
  network: "testnet" as const,
  expectedSource: source.publicKey(),
  firstTimeDestination: true,
  feeEstimated: false,
};

function build(overrides: Partial<Parameters<typeof buildPaymentTransaction>[0]> = {}) {
  return buildPaymentTransaction({
    sourceId: source.publicKey(),
    sourceSequence: "100",
    kind: "payment",
    destination: dest.publicKey(),
    amountStroops: 15_000_000n,
    memo: { type: "none" },
    feeStroops: 250n,
    networkPassphrase: TESTNET,
    ...overrides,
  });
}

function code(fn: () => unknown) {
  try {
    fn();
    return undefined;
  } catch (e: unknown) {
    return (e as { code?: string; message?: string }).message;
  }
}

describe("buildPaymentTransaction + summarizeTransaction (TRANSACTIONS §3.7–3.8)", () => {
  it("summarizes the built payment, not the input", () => {
    const tx = build({ memo: { type: "text", value: "héllo 😀" } });
    const s = summarizeTransaction(tx, ctx);
    expect(s).toMatchObject({
      kind: "payment",
      source: source.publicKey(),
      destination: dest.publicKey(),
      destinationBase: dest.publicKey(),
      amountStroops: "15000000",
      feeStroops: "250",
      totalStroops: "15000250",
      memo: { type: "text", value: "héllo 😀" },
      network: "testnet",
    });
    expect(tx.sequence).toBe("101");
    expect(s.expiresAt - Date.now()).toBeGreaterThan(170_000);
    expect(s.expiresAt - Date.now()).toBeLessThanOrEqual(181_000);
  });

  it("createAccount and memo id", () => {
    const s = summarizeTransaction(
      build({ kind: "createAccount", memo: { type: "id", value: "18446744073709551615" } }),
      ctx,
    );
    expect(s).toMatchObject({
      kind: "createAccount",
      memo: { type: "id", value: "18446744073709551615" },
    });
  });

  it("payment to an M address keeps M and reports the base", () => {
    const s = summarizeTransaction(build({ destination: muxedDest }), ctx);
    expect(s).toMatchObject({ destination: muxedDest, destinationBase: dest.publicKey() });
  });

  it("rehydrates to the same hash and the same summary", () => {
    const tx = build();
    const back = rehydrateTransaction(tx.toXdr(), TESTNET);
    expect(transactionHashHex(back)).toBe(transactionHashHex(tx));
    expect(transactionHashHex(tx)).toMatch(/^[0-9a-f]{64}$/);
    assertSameSummary(summarizeTransaction(tx, ctx), summarizeTransaction(back, ctx));
  });
});

describe("summary refuses anything unexpected (SECURITY §5.1)", () => {
  const raw = (
    ops: ReturnType<typeof Operation.payment>[],
    opts: { source?: string; passphrase?: string } = {},
  ) => {
    const b = new TransactionBuilder(new Account(opts.source ?? source.publicKey(), "1"), {
      fee: "100",
      networkPassphrase: opts.passphrase ?? TESTNET,
    });
    for (const op of ops) b.addOperation(op);
    return b.addMemo(Memo.none()).setTimeout(180).build();
  };
  const pay = () =>
    Operation.payment({ destination: dest.publicKey(), asset: Asset.native(), amount: "1" });

  it.each([
    ["more than one operation", () => raw([pay(), pay()])],
    ["a different source", () => raw([pay()], { source: Keypair.random().publicKey() })],
    ["the wrong network", () => raw([pay()], { passphrase: NETWORKS.mainnet.passphrase })],
    [
      "a non-native asset",
      () =>
        raw([
          Operation.payment({
            destination: dest.publicKey(),
            asset: new Asset("USDC", Keypair.random().publicKey()),
            amount: "1",
          }),
        ]),
    ],
    ["a disallowed operation type", () => raw([Operation.manageData({ name: "x", value: "1" })])],
    [
      "an operation-level source",
      () =>
        raw([
          Operation.payment({
            destination: dest.publicKey(),
            asset: Asset.native(),
            amount: "1",
            source: Keypair.random().publicKey(),
          }),
        ]),
    ],
  ])("%s", (_name, make) => {
    expect(code(() => summarizeTransaction(make(), ctx))).toMatch(/^Refusing/);
  });

  it("detects a stored summary that no longer matches", () => {
    const a = summarizeTransaction(build(), ctx);
    expect(() => {
      assertSameSummary(a, { ...a, amountStroops: "1" });
    }).toThrow(/no longer matches/);
  });
});
