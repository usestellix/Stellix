import { base64 } from "@scure/base";
import { xdr } from "@stellar/stellar-sdk/base";
import { describe, expect, it } from "vitest";
import { FIXTURES, fixture } from "../../__fixtures__/load.js";
import { decodeTransactionEnvelope } from "../envelope.js";

function decode(xdrBase64: string) {
  return decodeTransactionEnvelope(xdrBase64, "testnet");
}

function v1Tx(name: string): xdr.Transaction {
  const env = xdr.TransactionEnvelope.fromXdr(fixture(name).envelopeXdr, "base64");
  if (env.type !== "envelopeTypeTx") throw new Error(`${name} is not a v1 envelope`);
  return env.v1.tx;
}

function envelopeOf(tx: xdr.Transaction): string {
  return xdr.TransactionEnvelope.envelopeTypeTx(
    new xdr.TransactionV1Envelope({ tx, signatures: [] }),
  ).toXdr("base64");
}

/** payment-native with some fields replaced. */
function paymentNativeWith(
  changes: Partial<{ memo: xdr.Memo; cond: xdr.Preconditions }>,
): xdr.Transaction {
  const tx = v1Tx("payment-native");
  return new xdr.Transaction({
    sourceAccount: tx.sourceAccount,
    fee: tx.fee,
    seqNum: tx.seqNum,
    cond: changes.cond ?? tx.cond,
    memo: changes.memo ?? tx.memo,
    operations: tx.operations,
    ext: tx.ext,
  });
}

function withMemo(memo: xdr.Memo): string {
  return envelopeOf(paymentNativeWith({ memo }));
}

describe("decodeTransactionEnvelope", () => {
  it("matches Horizon's decoding of every captured fixture", () => {
    for (const f of FIXTURES) {
      const h = f.transaction.body;
      const { decoded, hashHex } = decode(f.envelopeXdr);
      expect(hashHex, f.name).toBe(h.hash);
      expect(decoded.source, f.name).toBe(h.account_muxed ?? h.source_account);
      expect(decoded.sequence, f.name).toBe(BigInt(h.source_account_sequence));
      expect(decoded.operations, f.name).toHaveLength(h.operation_count);
      expect(
        decoded.operations.map((op) => op.opType),
        f.name,
      ).toEqual(f.opTypes);
      if (h.inner_transaction === undefined) {
        expect(decoded.envelopeType, f.name).toBe("tx");
        expect(decoded.feeStroops, f.name).toBe(BigInt(h.max_fee));
        expect(decoded.feeBump, f.name).toBeNull();
      } else {
        expect(decoded.envelopeType, f.name).toBe("txFeeBump");
        expect(decoded.feeStroops, f.name).toBe(BigInt(h.inner_transaction.max_fee));
        expect(decoded.feeBump, f.name).toEqual({
          feeSource: h.fee_account_muxed ?? h.fee_account,
          maxFeeStroops: BigInt(h.max_fee),
          innerHashHex: h.inner_transaction.hash,
        });
      }
      if (h.memo_type === "none") expect(decoded.memo, f.name).toEqual({ type: "none" });
    }
  });

  it("decodes a fee bump: fee source, max fee and the inner transaction", () => {
    const { decoded } = decode(fixture("feeBump").envelopeXdr);
    expect(decoded).toMatchObject({
      envelopeType: "txFeeBump",
      // The inner transaction's source applies to its ops (SHIELD §6.6); the fee source pays.
      source: "GB2UTPVMBMQSS64UB74V3AQVQAQWNQ225NIWCIKJ3B4XNSJB5NQJFJLJ",
      feeStroops: 1000n,
      sequence: 23110037903769626n,
      maxTime: 1792927684n,
      operations: [{ kind: "undecoded", opType: "payment", source: null }],
      feeBump: {
        feeSource: "GDX3XHNB6XNJBRMOWOP4ZQVKL5CFMXD4MJFXFICFVGR7J2KQXMDIANZD",
        maxFeeStroops: 4000n,
        innerHashHex: "773d35f061365e0b90ce8c9724aa1b4c2a802b2dd8e10a6faa5fb582a4193258",
      },
    });
  });

  it("keeps muxed transaction and op sources as M… addresses", () => {
    const { decoded } = decode(fixture("payment-muxed-sources").envelopeXdr);
    expect(decoded.source).toMatch(/^M/);
    expect(decoded.operations[0]?.source).toMatch(/^M/);
  });

  it("decodes a text memo as Horizon does", () => {
    const f = fixture("payment-native");
    const { decoded } = decode(f.envelopeXdr);
    expect(f.transaction.body.memo_type).toBe("text");
    expect(decoded.memo).toMatchObject({ type: "text", text: f.transaction.body.memo });
  });

  it("decodes id, hash and return memos", () => {
    const bytes = new Uint8Array(32).fill(0xab);
    const hex = "ab".repeat(32);
    expect(decode(withMemo(xdr.Memo.memoId(2n ** 64n - 1n))).decoded.memo).toEqual({
      type: "id",
      id: 18446744073709551615n,
    });
    expect(decode(withMemo(xdr.Memo.memoHash(bytes))).decoded.memo).toEqual({ type: "hash", hex });
    expect(decode(withMemo(xdr.Memo.memoReturn(bytes))).decoded.memo).toEqual({
      type: "return",
      hex,
    });
  });

  it("keeps a text memo that isn't UTF-8 as hex only", () => {
    const { decoded } = decode(withMemo(xdr.Memo.memoText(new Uint8Array([0xff, 0xfe, 0x41]))));
    expect(decoded.memo).toEqual({ type: "text", text: null, hex: "fffe41" });
  });

  it("decodes a legacy v0 envelope like a v1 one", () => {
    const tx = v1Tx("payment-native");
    if (tx.sourceAccount.type !== "keyTypeEd25519") throw new Error("expected a G source");
    if (tx.cond.type !== "precondTime") throw new Error("expected time bounds");
    const v0 = new xdr.TransactionV0({
      sourceAccountEd25519: tx.sourceAccount.ed25519,
      fee: tx.fee,
      seqNum: tx.seqNum,
      timeBounds: tx.cond.timeBounds,
      memo: tx.memo,
      operations: tx.operations,
      ext: xdr.TransactionV0Ext.v0(),
    });
    const v0Xdr = xdr.TransactionEnvelope.envelopeTypeTxV0(
      new xdr.TransactionV0Envelope({ tx: v0, signatures: [] }),
    ).toXdr("base64");
    const fromV0 = decode(v0Xdr);
    const fromV1 = decode(envelopeOf(tx));
    expect(fromV0.decoded).toEqual(fromV1.decoded);
    // The network hashes a v0 transaction as its v1 equivalent.
    expect(fromV0.hashHex).toBe(fromV1.hashHex);
  });

  it("reports no maxTime when the transaction has no time bounds", () => {
    const tx = paymentNativeWith({ cond: xdr.Preconditions.precondNone() });
    expect(decode(envelopeOf(tx)).decoded.maxTime).toBeNull();
  });

  it("uses bigint for every amount, fee and sequence", () => {
    const { decoded } = decode(fixture("feeBump").envelopeXdr);
    expect(typeof decoded.feeStroops).toBe("bigint");
    expect(typeof decoded.sequence).toBe("bigint");
    expect(typeof decoded.feeBump?.maxFeeStroops).toBe("bigint");
    expect(typeof decoded.maxTime).toBe("bigint");
  });

  describe("rejects input that isn't exactly one transaction envelope", () => {
    const valid = fixture("payment-native");
    const raw = base64.decode(valid.envelopeXdr);
    const b64 = (bytes: Uint8Array) => base64.encode(bytes);

    const cases: [string, string][] = [
      ["empty", ""],
      ["not base64", "not base64 !!"],
      ["truncated to 4 bytes", "AAAAAg=="],
      ["truncated mid-operation", b64(raw.slice(0, raw.length - 80))],
      ["missing its last byte", b64(raw.slice(0, raw.length - 1))],
      ["with trailing bytes", b64(new Uint8Array([...raw, 0, 0, 0, 0]))],
      // Real XDR of other types, from the same Horizon response.
      ["a TransactionResult", valid.transaction.body.result_xdr],
      ["a fee LedgerEntryChanges", valid.transaction.body.fee_meta_xdr],
      // ENVELOPE_TYPE_SOROBAN_AUTHORIZATION (9) is an EnvelopeType but not a TransactionEnvelope arm.
      ["an unknown envelope arm", b64(new Uint8Array([0, 0, 0, 9, ...raw.slice(4)]))],
    ];

    it.each(cases)("%s", (_label, input) => {
      expect(() => decode(input)).toThrow(
        expect.objectContaining({ code: "SHIELD_INPUT_INVALID" }) as Error,
      );
    });

    it("never echoes the input in the error", () => {
      const input = b64(raw.slice(0, raw.length - 1));
      try {
        decode(input);
        expect.unreachable();
      } catch (e) {
        expect((e as Error).message).not.toContain(input.slice(0, 16));
      }
    });
  });
});
