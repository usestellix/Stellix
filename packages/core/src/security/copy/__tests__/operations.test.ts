import { hex } from "@scure/base";
import { describe, expect, it } from "vitest";
import { FIXTURES, fixture } from "../../__fixtures__/load.js";
import { PEER, USER } from "../../__tests__/build-tx.js";
import { decodeTransactionEnvelope } from "../../decode/envelope.js";
import type { DecodedOperation } from "../../decode/operation-types.js";
import { resolveSources, type OpSource } from "../../decode/sources.js";
import { DESCRIBERS, describeOperation } from "../operations.js";

const ME: OpSource = { address: USER, account: USER, isUser: true, explicit: false };
const THEM: OpSource = { address: PEER, account: PEER, isUser: false, explicit: true };

const PLN = { type: "credit", code: "PLN", issuer: PEER } as const;
const XLM = { type: "native" } as const;
const POOL = "LA7BNCCF2M2JOVUF6ZDZ3ZIQSOCT3AFYYM3RIX7AT4F44FGXEJAX5KJW";
const BALANCE = "BAACHM6Q4FMNFDDESLUU5RIIHEZQM2MGOVACXZQOZRWMWCEUQLR35H5ONI";
const KEY = { type: "ed25519", key: PEER } as const;
const text = (t: string) => ({ text: t, hex: hex.encode(new TextEncoder().encode(t)) });
const noFlags = { flags: [], unknownBits: 0 };
const noOptions = {
  inflationDest: null,
  clearFlags: null,
  setFlags: null,
  masterWeight: null,
  lowThreshold: null,
  medThreshold: null,
  highThreshold: null,
  homeDomain: null,
  signer: null,
};

/**
 * At least one sample per kind, typed over the union: adding a DecodedOperation kind without a
 * sample here (or a describer) fails to compile. Variants with several wordings get one each.
 */
const SAMPLES: { [K in DecodedOperation["kind"]]: Extract<DecodedOperation, { kind: K }>[] } = {
  createAccount: [
    {
      kind: "createAccount",
      opType: "createAccount",
      source: null,
      destination: PEER,
      startingBalanceStroops: 20_000_000n,
    },
  ],
  payment: [
    {
      kind: "payment",
      opType: "payment",
      source: null,
      destination: PEER,
      asset: PLN,
      amountStroops: 1n,
    },
  ],
  pathPaymentStrictSend: [
    {
      kind: "pathPaymentStrictSend",
      opType: "pathPaymentStrictSend",
      source: null,
      sendAsset: XLM,
      sendAmountStroops: 10n,
      destination: PEER,
      destAsset: PLN,
      destMinStroops: 5n,
      path: [PLN],
    },
  ],
  pathPaymentStrictReceive: [
    {
      kind: "pathPaymentStrictReceive",
      opType: "pathPaymentStrictReceive",
      source: null,
      sendAsset: XLM,
      sendMaxStroops: 10n,
      destination: PEER,
      destAsset: PLN,
      destAmountStroops: 5n,
      path: [],
    },
  ],
  accountMerge: [{ kind: "accountMerge", opType: "accountMerge", source: null, destination: PEER }],
  manageSellOffer: [
    {
      kind: "manageSellOffer",
      opType: "manageSellOffer",
      source: null,
      selling: PLN,
      buying: XLM,
      amountStroops: 10n,
      price: { n: 1n, d: 3n },
      offerId: 0n,
    },
    {
      kind: "manageSellOffer",
      opType: "manageSellOffer",
      source: null,
      selling: PLN,
      buying: XLM,
      amountStroops: 10n,
      price: { n: 3n, d: 2n },
      offerId: 7n,
    },
    {
      kind: "manageSellOffer",
      opType: "manageSellOffer",
      source: null,
      selling: PLN,
      buying: XLM,
      amountStroops: 0n,
      price: { n: 3n, d: 2n },
      offerId: 7n,
    },
  ],
  manageBuyOffer: [
    {
      kind: "manageBuyOffer",
      opType: "manageBuyOffer",
      source: null,
      selling: XLM,
      buying: PLN,
      buyAmountStroops: 10n,
      price: { n: 1n, d: 2n },
      offerId: 0n,
    },
    {
      kind: "manageBuyOffer",
      opType: "manageBuyOffer",
      source: null,
      selling: XLM,
      buying: PLN,
      buyAmountStroops: 10n,
      price: { n: 1n, d: 2n },
      offerId: 7n,
    },
    {
      kind: "manageBuyOffer",
      opType: "manageBuyOffer",
      source: null,
      selling: XLM,
      buying: PLN,
      buyAmountStroops: 0n,
      price: { n: 1n, d: 2n },
      offerId: 7n,
    },
  ],
  createPassiveSellOffer: [
    {
      kind: "createPassiveSellOffer",
      opType: "createPassiveSellOffer",
      source: null,
      selling: PLN,
      buying: XLM,
      amountStroops: 10n,
      price: { n: 2n, d: 1n },
    },
  ],
  liquidityPoolDeposit: [
    {
      kind: "liquidityPoolDeposit",
      opType: "liquidityPoolDeposit",
      source: null,
      liquidityPoolId: POOL,
      maxAmountAStroops: 10n,
      maxAmountBStroops: 10n,
      minPrice: { n: 1n, d: 2n },
      maxPrice: { n: 2n, d: 1n },
    },
  ],
  liquidityPoolWithdraw: [
    {
      kind: "liquidityPoolWithdraw",
      opType: "liquidityPoolWithdraw",
      source: null,
      liquidityPoolId: POOL,
      amountStroops: 10n,
      minAmountAStroops: 1n,
      minAmountBStroops: 1n,
    },
  ],
  setOptions: [
    { kind: "setOptions", opType: "setOptions", source: null, ...noOptions },
    {
      kind: "setOptions",
      opType: "setOptions",
      source: null,
      ...noOptions,
      signer: { key: KEY, weight: 1 },
    },
    {
      kind: "setOptions",
      opType: "setOptions",
      source: null,
      ...noOptions,
      signer: { key: KEY, weight: 0 },
    },
    {
      kind: "setOptions",
      opType: "setOptions",
      source: null,
      inflationDest: PEER,
      clearFlags: { flags: ["authRevocable"], unknownBits: 0 },
      setFlags: { flags: ["authRequired"], unknownBits: 0x10 },
      masterWeight: 0,
      lowThreshold: 1,
      medThreshold: 2,
      highThreshold: 3,
      homeDomain: text("example.com"),
      signer: null,
    },
    { kind: "setOptions", opType: "setOptions", source: null, ...noOptions, homeDomain: text("") },
  ],
  manageData: [
    {
      kind: "manageData",
      opType: "manageData",
      source: null,
      dataName: text("n"),
      dataValue: text("v"),
    },
    {
      kind: "manageData",
      opType: "manageData",
      source: null,
      dataName: { text: null, hex: "ff" },
      dataValue: null,
    },
  ],
  bumpSequence: [{ kind: "bumpSequence", opType: "bumpSequence", source: null, bumpTo: 9n }],
  changeTrust: [
    { kind: "changeTrust", opType: "changeTrust", source: null, line: PLN, limitStroops: 10n },
    { kind: "changeTrust", opType: "changeTrust", source: null, line: PLN, limitStroops: 0n },
    {
      kind: "changeTrust",
      opType: "changeTrust",
      source: null,
      line: { type: "poolShare", liquidityPoolId: POOL, assetA: XLM, assetB: PLN, feeBps: 30 },
      limitStroops: 2n ** 63n - 1n,
    },
  ],
  allowTrust: [
    {
      kind: "allowTrust",
      opType: "allowTrust",
      source: null,
      trustor: PEER,
      assetCode: "PLN",
      authorize: { flags: ["authorized"], unknownBits: 0 },
    },
    {
      kind: "allowTrust",
      opType: "allowTrust",
      source: null,
      trustor: PEER,
      assetCode: "PLN",
      authorize: noFlags,
    },
  ],
  setTrustLineFlags: [
    {
      kind: "setTrustLineFlags",
      opType: "setTrustLineFlags",
      source: null,
      trustor: PEER,
      asset: PLN,
      clearFlags: noFlags,
      setFlags: { flags: ["authorized"], unknownBits: 0 },
    },
  ],
  clawback: [
    {
      kind: "clawback",
      opType: "clawback",
      source: null,
      from: PEER,
      asset: PLN,
      amountStroops: 10n,
    },
  ],
  clawbackClaimableBalance: [
    {
      kind: "clawbackClaimableBalance",
      opType: "clawbackClaimableBalance",
      source: null,
      balanceId: BALANCE,
    },
  ],
  createClaimableBalance: [
    {
      kind: "createClaimableBalance",
      opType: "createClaimableBalance",
      source: null,
      asset: XLM,
      amountStroops: 10n,
      claimants: [{ destination: PEER, predicate: { type: "unconditional" } }],
    },
  ],
  claimClaimableBalance: [
    {
      kind: "claimClaimableBalance",
      opType: "claimClaimableBalance",
      source: null,
      balanceId: BALANCE,
    },
  ],
  beginSponsoringFutureReserves: [
    {
      kind: "beginSponsoringFutureReserves",
      opType: "beginSponsoringFutureReserves",
      source: null,
      sponsoredId: PEER,
    },
  ],
  endSponsoringFutureReserves: [
    { kind: "endSponsoringFutureReserves", opType: "endSponsoringFutureReserves", source: null },
  ],
  revokeSponsorship: (
    [
      { type: "account", accountId: PEER },
      { type: "trustline", accountId: PEER, asset: PLN },
      { type: "trustline", accountId: PEER, asset: { type: "poolShare", liquidityPoolId: POOL } },
      { type: "offer", sellerId: PEER, offerId: 7n },
      { type: "data", accountId: PEER, dataName: text("n") },
      { type: "claimableBalance", balanceId: BALANCE },
      { type: "liquidityPool", liquidityPoolId: POOL },
      { type: "signer", accountId: PEER, signerKey: KEY },
    ] as const
  ).map((entry) => ({
    kind: "revokeSponsorship",
    opType: "revokeSponsorship",
    source: null,
    entry,
  })),
  unsupported: [
    { kind: "unsupported", opType: "invokeHostFunction", reason: "soroban", source: null },
    { kind: "unsupported", opType: "inflation", reason: "obsolete", source: null },
    { kind: "unsupported", opType: "someFutureOp", reason: "unknown", source: null },
  ],
};

const allSamples = Object.values(SAMPLES).flat() as DecodedOperation[];

describe("operation descriptions", () => {
  it("has a describer for exactly the kinds there are samples for", () => {
    expect(Object.keys(DESCRIBERS).sort()).toEqual(Object.keys(SAMPLES).sort());
  });

  it.each(allSamples.map((op, i) => [i, op.kind, op] as const))(
    "describes sample %i (%s) fully, from either side, without claiming safety",
    (_i, _kind, op) => {
      for (const source of [ME, THEM]) {
        const description = describeOperation(op, source);
        expect(description.length).toBeGreaterThan(10);
        expect(description).not.toMatch(/[{}]/);
        expect(description).not.toMatch(/\bsafe/i);
      }
    },
  );

  it("says whose account an operation acts on", () => {
    const [payment] = SAMPLES.payment;
    expect(describeOperation(payment!, ME)).toBe(
      `Sends 0.0000001 PLN (${PEER}) from your account to ${PEER}.`,
    );
    expect(describeOperation(payment!, THEM)).toContain(`from ${PEER} to`);
  });

  it("shows prices exactly", () => {
    const [create, update] = SAMPLES.manageSellOffer;
    expect(describeOperation(create!, ME)).toContain(
      "at about 0.3333333 (exactly 1/3) XLM per PLN.",
    );
    expect(describeOperation(update!, ME)).toContain("at 1.5 XLM per PLN.");
  });

  it("describes every setOptions field", () => {
    const description = describeOperation(SAMPLES.setOptions[3]!, ME);
    for (const part of [
      "Sets the weight of the master key of your account to 0.",
      "Sets the low threshold of your account to 1.",
      "Sets the medium threshold of your account to 2.",
      "Sets the high threshold of your account to 3.",
      "Turns on authorization required, unknown flag bits 0x10 on your account.",
      "Turns off authorization revocable on your account.",
      'Sets the home domain of your account to "example.com".',
      `Sets the inflation destination of your account to ${PEER}.`,
    ]) {
      expect(description).toContain(part);
    }
  });

  it("matches the snapshot for every captured fixture, from the user's side", () => {
    for (const f of FIXTURES) {
      const { decoded } = decodeTransactionEnvelope(f.envelopeXdr, "testnet");
      const sources = resolveSources(decoded, USER);
      const lines = decoded.operations.map((op, i) => describeOperation(op, sources.ops[i]!));
      expect(lines).toMatchSnapshot(f.name);
    }
  });

  it("describes the captured payment in plain words", () => {
    const { decoded } = decodeTransactionEnvelope(fixture("payment-native").envelopeXdr, "testnet");
    const sources = resolveSources(decoded, USER);
    expect(describeOperation(decoded.operations[0]!, sources.ops[0]!)).toBe(
      `Sends 1 XLM from your account to ${PEER}.`,
    );
  });
});
