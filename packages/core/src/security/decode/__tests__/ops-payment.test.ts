import { decodeAddressToMuxedAccount, xdr } from "@stellar/stellar-sdk/base";
import { describe, expect, it } from "vitest";
import { CLAW, PEER, PLN, USER, decodeWith, op, sdkJson } from "./helpers.js";

const MUXED_PEER = "MDX3XHNB6XNJBRMOWOP4ZQVKL5CFMXD4MJFXFICFVGR7J2KQXMDIAAAAAAAAABTZGJRSO";

describe("createAccount", () => {
  it("decodes destination and starting balance", () => {
    expect(op("createAccount")).toEqual({
      kind: "createAccount",
      opType: "createAccount",
      source: null,
      destination: "GDL5RCVVDNPCBFPP2SGNNXTOHVHHGKD5TZNPPQL2MRRKY4RZRIDTOZK3",
      startingBalanceStroops: 20_000_000n,
    });
  });
});

describe("payment", () => {
  it("decodes a native payment", () => {
    expect(op("payment-native")).toEqual({
      kind: "payment",
      opType: "payment",
      source: null,
      destination: PEER,
      asset: { type: "native" },
      amountStroops: 10_000_000n,
    });
  });

  it("decodes a credit-asset payment", () => {
    expect(op("payment-credit")).toMatchObject({
      destination: USER,
      asset: CLAW,
      amountStroops: 10_000_000_000n,
    });
  });

  it("keeps a muxed destination as its M… address, as the SDK encodes it", () => {
    expect(op("payment-muxed-destination")).toMatchObject({
      destination: MUXED_PEER,
      amountStroops: 12_500_000n,
    });
    expect(sdkJson("payment-muxed-destination")).toMatchObject({
      payment: { destination: MUXED_PEER },
    });
  });

  it("keeps a muxed op source", () => {
    expect(op("payment-muxed-sources").source).toMatch(/^M/);
  });
});

describe("path payments", () => {
  it("decodes pathPaymentStrictReceive with its path", () => {
    expect(op("pathPaymentStrictReceive")).toEqual({
      kind: "pathPaymentStrictReceive",
      opType: "pathPaymentStrictReceive",
      source: null,
      sendAsset: { type: "native" },
      sendMaxStroops: 50_000_000n,
      destination: PEER,
      destAsset: CLAW,
      destAmountStroops: 10_000_000n,
      path: [PLN],
    });
    expect(sdkJson("pathPaymentStrictReceive")).toMatchObject({
      path_payment_strict_receive: {
        path: [{ credit_alphanum4: { asset_code: "PLN", issuer: PLN.issuer } }],
      },
    });
  });

  it("decodes pathPaymentStrictSend with an empty path", () => {
    expect(op("pathPaymentStrictSend")).toEqual({
      kind: "pathPaymentStrictSend",
      opType: "pathPaymentStrictSend",
      source: null,
      sendAsset: { type: "native" },
      sendAmountStroops: 10_000_000n,
      destination: PEER,
      destAsset: PLN,
      destMinStroops: 5_000_000n,
      path: [],
    });
  });

  it("keeps a muxed path-payment destination", () => {
    const [decoded] = decodeWith(
      xdr.OperationBody.pathPaymentStrictSend(
        new xdr.PathPaymentStrictSendOp({
          sendAsset: xdr.Asset.assetTypeNative(),
          sendAmount: 1n,
          destination: decodeAddressToMuxedAccount(MUXED_PEER),
          destAsset: xdr.Asset.assetTypeNative(),
          destMin: 1n,
          path: [],
        }),
      ),
    );
    expect(decoded).toMatchObject({ destination: MUXED_PEER });
  });
});

describe("accountMerge", () => {
  it("decodes the destination", () => {
    expect(op("accountMerge")).toEqual({
      kind: "accountMerge",
      opType: "accountMerge",
      source: null,
      destination: USER,
    });
  });

  it("keeps a muxed destination", () => {
    const [decoded] = decodeWith(
      xdr.OperationBody.accountMerge(decodeAddressToMuxedAccount(MUXED_PEER)),
    );
    expect(decoded).toMatchObject({ kind: "accountMerge", destination: MUXED_PEER });
  });
});
