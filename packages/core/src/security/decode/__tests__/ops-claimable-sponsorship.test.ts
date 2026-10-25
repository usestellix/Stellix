import { StrKey, xdr } from "@stellar/stellar-sdk/base";
import { describe, expect, it } from "vitest";
import type { DecodedOperation } from "../operation-types.js";
import {
  PEER,
  PLN_ISSUER,
  SPONSORED,
  USER,
  ascii,
  decodeWith,
  invalid,
  op,
  ops,
  pk,
  sdkJson,
} from "./helpers.js";

function revoke(key: xdr.LedgerKey): xdr.OperationBody {
  return xdr.OperationBody.revokeSponsorship(
    xdr.RevokeSponsorshipOp.revokeSponsorshipLedgerEntry(key),
  );
}

function trustlineKey(asset: xdr.TrustLineAsset): xdr.LedgerKey {
  return xdr.LedgerKey.trustline(new xdr.LedgerKeyTrustLine({ accountId: pk(SPONSORED), asset }));
}

function code12(code: Uint8Array): xdr.TrustLineAsset {
  return xdr.TrustLineAsset.assetTypeCreditAlphanum12(
    new xdr.AlphaNum12({ assetCode: new xdr.AssetCode12(code), issuer: pk(PLN_ISSUER) }),
  );
}

function code4(code: Uint8Array): xdr.TrustLineAsset {
  return xdr.TrustLineAsset.assetTypeCreditAlphanum4(
    new xdr.AlphaNum4({ assetCode: new xdr.AssetCode4(code), issuer: pk(PLN_ISSUER) }),
  );
}

function createClaimable(predicate: xdr.ClaimPredicate): xdr.OperationBody {
  return xdr.OperationBody.createClaimableBalance(
    new xdr.CreateClaimableBalanceOp({
      asset: xdr.Asset.assetTypeNative(),
      amount: 1n,
      claimants: [
        xdr.Claimant.claimantTypeV0(new xdr.ClaimantV0({ destination: pk(PEER), predicate })),
      ],
    }),
  );
}

const P = xdr.ClaimPredicate;

describe("createClaimableBalance", () => {
  it("decodes asset, amount and claimants with nested and/or/not and time predicates", () => {
    expect(op("createClaimableBalance")).toEqual({
      kind: "createClaimableBalance",
      opType: "createClaimableBalance",
      source: null,
      asset: { type: "native" },
      amountStroops: 50_000_000n,
      claimants: [
        { destination: PEER, predicate: { type: "unconditional" } },
        {
          destination: USER,
          predicate: {
            type: "or",
            predicates: [
              {
                type: "and",
                predicates: [
                  { type: "not", predicate: { type: "beforeRelativeTime", seconds: 3600n } },
                  { type: "beforeAbsoluteTime", epochSeconds: 1_824_463_438n },
                ],
              },
              { type: "beforeRelativeTime", seconds: 60n },
            ],
          },
        },
      ],
    });
  });

  it("decodes the claimable balance inside a sponsorship sandwich", () => {
    expect(op("sponsorship-entries", 6)).toMatchObject({
      kind: "createClaimableBalance",
      amountStroops: 10_000_000n,
      claimants: [{ destination: PEER, predicate: { type: "unconditional" } }],
    });
  });

  it("decodes a credit asset", () => {
    const body = xdr.OperationBody.createClaimableBalance(
      new xdr.CreateClaimableBalanceOp({
        asset: xdr.Asset.assetTypeCreditAlphanum4(
          new xdr.AlphaNum4({
            assetCode: new xdr.AssetCode4(ascii("PLN", 4)),
            issuer: pk(PLN_ISSUER),
          }),
        ),
        amount: 9_223_372_036_854_775_807n,
        claimants: [],
      }),
    );
    expect(decodeWith(body)[0]).toMatchObject({
      asset: { type: "credit", code: "PLN", issuer: PLN_ISSUER },
      amountStroops: 9_223_372_036_854_775_807n,
    });
  });

  it("accepts predicates nested 4 deep, as stellar-core does", () => {
    const depth4 = P.claimPredicateNot(
      P.claimPredicateNot(P.claimPredicateNot(P.claimPredicateUnconditional())),
    );
    expect(decodeWith(createClaimable(depth4))[0]?.kind).toBe("createClaimableBalance");
  });

  it.each<[string, xdr.ClaimPredicate]>([
    [
      "nested 5 deep",
      P.claimPredicateNot(
        P.claimPredicateNot(
          P.claimPredicateNot(P.claimPredicateNot(P.claimPredicateUnconditional())),
        ),
      ),
    ],
    // XDR caps and/or at two predicates, so three can't even be encoded; one can.
    ["an and with one predicate", P.claimPredicateAnd([P.claimPredicateUnconditional()])],
    ["an empty not", P.claimPredicateNot(null)],
    ["a negative absolute time", P.claimPredicateBeforeAbsoluteTime(-1n)],
    ["a negative relative time", P.claimPredicateBeforeRelativeTime(-1n)],
  ])("rejects a predicate stellar-core rejects: %s", (_label, predicate) => {
    expect(() => decodeWith(createClaimable(predicate))).toThrow(invalid);
  });
});

describe("claimClaimableBalance", () => {
  it("decodes the balance ID as the SDK's B… StrKey", () => {
    const decoded = op("claimClaimableBalance");
    expect(decoded).toEqual({
      kind: "claimClaimableBalance",
      opType: "claimClaimableBalance",
      source: null,
      balanceId: "BAACHM6Q4FMNFDDESLUU5RIIHEZQM2MGOVACXZQOZRWMWCEUQLR35H5ONI",
    });
    expect(sdkJson("claimClaimableBalance")).toEqual({
      claim_claimable_balance: { balance_id: (decoded as { balanceId: string }).balanceId },
    });
  });
});

describe("begin/endSponsoringFutureReserves", () => {
  it("decodes the sponsored account and the closing end", () => {
    expect(ops("sponsorship-create-account")).toEqual([
      {
        kind: "beginSponsoringFutureReserves",
        opType: "beginSponsoringFutureReserves",
        source: null,
        sponsoredId: "GDLDBGWQOA6FFWJMXIXYEZDWIYK7BM7VHFCRYGYF67C2BRMR7JGVKID3",
      },
      {
        kind: "createAccount",
        opType: "createAccount",
        source: null,
        destination: "GDLDBGWQOA6FFWJMXIXYEZDWIYK7BM7VHFCRYGYF67C2BRMR7JGVKID3",
        startingBalanceStroops: 50_000_000n,
      },
      {
        kind: "endSponsoringFutureReserves",
        opType: "endSponsoringFutureReserves",
        source: "GDLDBGWQOA6FFWJMXIXYEZDWIYK7BM7VHFCRYGYF67C2BRMR7JGVKID3",
      },
    ]);
  });
});

describe("revokeSponsorship", () => {
  const entryOf = (o: DecodedOperation | undefined) =>
    o?.kind === "revokeSponsorship" ? o.entry : undefined;

  it.each<[string, unknown]>([
    [
      "revokeSponsorship-account",
      { type: "account", accountId: "GDLDBGWQOA6FFWJMXIXYEZDWIYK7BM7VHFCRYGYF67C2BRMR7JGVKID3" },
    ],
    [
      "revokeSponsorship-trustline",
      {
        type: "trustline",
        accountId: SPONSORED,
        asset: { type: "credit", code: "PLN", issuer: PLN_ISSUER },
      },
    ],
    [
      "revokeSponsorship-pool-share-trustline",
      {
        type: "trustline",
        accountId: SPONSORED,
        asset: {
          type: "poolShare",
          liquidityPoolId: "LA7BNCCF2M2JOVUF6ZDZ3ZIQSOCT3AFYYM3RIX7AT4F44FGXEJAX5KJW",
        },
      },
    ],
    ["revokeSponsorship-offer", { type: "offer", sellerId: SPONSORED, offerId: 931_478n }],
    [
      "revokeSponsorship-data",
      {
        type: "data",
        accountId: SPONSORED,
        dataName: { text: "sponsored", hex: "73706f6e736f726564" },
      },
    ],
    [
      "revokeSponsorship-signer",
      {
        type: "signer",
        accountId: SPONSORED,
        signerKey: {
          type: "ed25519",
          key: "GDZPAFFKMKFM2U7VHPDNZ3HLPEBFI2D7SZOCH72TIU74K2BXDQWAWYUO",
        },
      },
    ],
  ])("decodes %s", (name, entry) => {
    expect(op(name)).toEqual({
      kind: "revokeSponsorship",
      opType: "revokeSponsorship",
      source: null,
      entry,
    });
  });

  it("decodes a claimable-balance entry between begin and end", () => {
    const [begin, revokeOp, end] = ops("revokeSponsorship-claimable-balance");
    expect(begin).toMatchObject({ kind: "beginSponsoringFutureReserves", sponsoredId: USER });
    expect(entryOf(revokeOp)).toEqual({
      type: "claimableBalance",
      balanceId: "BAAKG4MH3ET3OIPNW54TKRHTCWQFGV6HS6Y4ADPWCBYLZGV3MERJFIC5LE",
    });
    expect(sdkJson("revokeSponsorship-claimable-balance", 1)).toEqual({
      revoke_sponsorship: {
        ledger_entry: {
          claimable_balance: {
            balance_id: (entryOf(revokeOp) as { balanceId: string }).balanceId,
          },
        },
      },
    });
    expect(end).toMatchObject({ kind: "endSponsoringFutureReserves" });
  });

  // The network can't apply these, so testnet can't produce them; they're built here instead.
  it("decodes a liquidity-pool entry", () => {
    const poolId = new Uint8Array(32).fill(7);
    const [decoded] = decodeWith(
      revoke(
        xdr.LedgerKey.liquidityPool(
          new xdr.LedgerKeyLiquidityPool({ liquidityPoolId: new xdr.PoolId(poolId) }),
        ),
      ),
    );
    expect(entryOf(decoded)).toEqual({
      type: "liquidityPool",
      liquidityPoolId: StrKey.encodeLiquidityPool(poolId),
    });
  });

  it("marks a Soroban ledger key unsupported, so UNSUPPORTED_OP reports it", () => {
    const [decoded] = decodeWith(
      revoke(
        xdr.LedgerKey.ttl(new xdr.LedgerKeyTtl({ keyHash: new xdr.Hash(new Uint8Array(32)) })),
      ),
    );
    expect(decoded).toEqual({
      kind: "unsupported",
      opType: "revokeSponsorship",
      reason: "soroban",
      source: null,
    });
  });

  it("decodes each signer key type", () => {
    const bytes = new Uint8Array(32).fill(1);
    const signer = (signerKey: xdr.SignerKey) =>
      xdr.OperationBody.revokeSponsorship(
        xdr.RevokeSponsorshipOp.revokeSponsorshipSigner(
          new xdr.RevokeSponsorshipOpSigner({ accountId: pk(SPONSORED), signerKey }),
        ),
      );
    const payload = new xdr.SignerKeyEd25519SignedPayload({
      ed25519: bytes,
      payload: new Uint8Array([1, 2, 3]),
    });
    const decoded = decodeWith(
      signer(xdr.SignerKey.signerKeyTypePreAuthTx(bytes)),
      signer(xdr.SignerKey.signerKeyTypeHashX(bytes)),
      signer(xdr.SignerKey.signerKeyTypeEd25519SignedPayload(payload)),
    ).map((o) => {
      const e = entryOf(o);
      return e?.type === "signer" ? e.signerKey : undefined;
    });
    expect(decoded).toEqual([
      { type: "preAuthTx", key: StrKey.encodePreAuthTx(bytes) },
      { type: "hashX", key: StrKey.encodeSha256Hash(bytes) },
      { type: "signedPayload", key: StrKey.encodeSignedPayload(payload.toXdr()) },
    ]);
  });

  it("decodes a 12-character asset code", () => {
    const [decoded] = decodeWith(revoke(trustlineKey(code12(ascii("LONGCODE12AB", 12)))));
    expect(entryOf(decoded)).toMatchObject({ asset: { type: "credit", code: "LONGCODE12AB" } });
  });

  it.each<[string, xdr.TrustLineAsset]>([
    ["an empty alphanum4 code", code4(new Uint8Array(4))],
    ["a zero byte inside a code", code4(new Uint8Array([0x41, 0, 0x42, 0]))],
    ["a non-alphanumeric code", code4(ascii("US$", 4))],
    ["a non-ASCII code", code4(new Uint8Array([0xc3, 0xa9, 0, 0]))],
    ["an alphanum12 code shorter than 5", code12(ascii("ABCD", 12))],
  ])("rejects an asset stellar-core rejects: %s", (_label, asset) => {
    expect(() => decodeWith(revoke(trustlineKey(asset)))).toThrow(invalid);
  });
});
