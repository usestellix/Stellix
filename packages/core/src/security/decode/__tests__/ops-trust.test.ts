import { xdr } from "@stellar/stellar-sdk/base";
import { describe, expect, it } from "vitest";
import { CLAW, PEER, PLN, POOL_ID, USER, decodeWith, invalid, op, pk, sdkJson } from "./helpers.js";

describe("changeTrust", () => {
  it("decodes an asset trustline and its limit", () => {
    expect(op("changeTrust-asset")).toEqual({
      kind: "changeTrust",
      opType: "changeTrust",
      source: null,
      line: CLAW,
      limitStroops: 10_000_000_000_000n,
    });
  });

  it("decodes a pool-share trustline with the pool ID its deposit uses", () => {
    expect(op("changeTrust-pool-share")).toMatchObject({
      line: {
        type: "poolShare",
        // Derived from the parameters; the deposit fixture names the pool by this ID.
        liquidityPoolId: POOL_ID,
        assetA: { type: "native" },
        assetB: PLN,
        feeBps: 30,
      },
      limitStroops: 9_223_372_036_854_775_807n,
    });
  });

  it("decodes a removal (limit 0)", () => {
    expect(op("changeTrust-remove")).toMatchObject({
      line: { type: "credit", code: "RMV" },
      limitStroops: 0n,
    });
  });
});

describe("allowTrust", () => {
  it("decodes trustor, asset code and authorization", () => {
    expect(op("allowTrust")).toEqual({
      kind: "allowTrust",
      opType: "allowTrust",
      source: null,
      trustor: USER,
      assetCode: "CLAW",
      authorize: { flags: ["authorized"], unknownBits: 0 },
    });
  });

  it("rejects an asset code stellar-core rejects", () => {
    const body = xdr.OperationBody.allowTrust(
      new xdr.AllowTrustOp({
        trustor: pk(USER),
        asset: xdr.AssetCode.assetTypeCreditAlphanum4(new xdr.AssetCode4(new Uint8Array(4))),
        authorize: 1,
      }),
    );
    expect(() => decodeWith(body)).toThrow(invalid);
  });
});

describe("setTrustLineFlags", () => {
  it("decodes trustor, asset and flags", () => {
    expect(op("setTrustLineFlags")).toEqual({
      kind: "setTrustLineFlags",
      opType: "setTrustLineFlags",
      source: null,
      trustor: PEER,
      asset: CLAW,
      clearFlags: { flags: [], unknownBits: 0 },
      setFlags: { flags: ["authorized"], unknownBits: 0 },
    });
  });

  it("keeps bits no flag defines instead of hiding them", () => {
    const [decoded] = decodeWith(
      xdr.OperationBody.setTrustLineFlags(
        new xdr.SetTrustLineFlagsOp({
          trustor: pk(PEER),
          asset: xdr.Asset.assetTypeNative(),
          clearFlags: 0,
          setFlags: 0x80000006,
        }),
      ),
    );
    expect(decoded).toMatchObject({
      setFlags: {
        flags: ["authorizedToMaintainLiabilities", "trustlineClawbackEnabled"],
        unknownBits: 0x80000000,
      },
    });
  });
});

describe("clawback", () => {
  it("decodes from, asset and amount", () => {
    expect(op("clawback")).toEqual({
      kind: "clawback",
      opType: "clawback",
      source: null,
      from: USER,
      asset: CLAW,
      amountStroops: 100_000_000n,
    });
  });
});

describe("clawbackClaimableBalance", () => {
  it("decodes the balance ID as the SDK encodes it", () => {
    const decoded = op("clawbackClaimableBalance");
    expect(decoded).toEqual({
      kind: "clawbackClaimableBalance",
      opType: "clawbackClaimableBalance",
      source: null,
      balanceId: expect.stringMatching(/^B/) as string,
    });
    expect(sdkJson("clawbackClaimableBalance")).toEqual({
      clawback_claimable_balance: { balance_id: (decoded as { balanceId: string }).balanceId },
    });
  });
});
