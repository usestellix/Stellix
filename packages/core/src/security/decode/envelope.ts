import {
  FeeBumpTransaction,
  StrKey,
  TransactionBuilder,
  xdr,
  type Transaction,
} from "@stellar/stellar-sdk/base";
import { assertNever } from "../../assert-never.js";
import { NETWORKS, type NetworkId } from "../../network/config.js";
import { transactionHashHex } from "../../tx/build.js";
import type { DecodedMemo, DecodedTransaction } from "../types.js";
import { decodeOperation } from "./operations.js";
import { bytesHex, decodeText, invalidInput, muxedAddress } from "./xdr-values.js";

// TransactionEnvelope and FeeBumpTransactionEnvelope → DecodedTransaction (SHIELD §3.1, §5).
// The XDR parser rejects truncated input, trailing bytes and unknown union arms, so anything
// that isn't exactly one transaction envelope fails here with SHIELD_INPUT_INVALID.

export interface DecodedEnvelope {
  decoded: DecodedTransaction;
  /** Transaction hash (fee bump: the fee-bump hash) under the request's network. */
  hashHex: string;
}

function parseEnvelope(xdrBase64: string): xdr.TransactionEnvelope {
  try {
    return xdr.TransactionEnvelope.fromXdr(xdrBase64, "base64");
  } catch {
    // Never echo the input: it's untrusted and may be large.
    throw invalidInput("Not a transaction envelope");
  }
}

function hashes(env: xdr.TransactionEnvelope, network: NetworkId) {
  let tx: Transaction | FeeBumpTransaction;
  try {
    tx = TransactionBuilder.fromXdr(env, NETWORKS[network].passphrase);
  } catch {
    throw invalidInput("Not a transaction envelope");
  }
  return {
    hashHex: transactionHashHex(tx),
    innerHashHex: tx instanceof FeeBumpTransaction ? transactionHashHex(tx.innerTransaction) : null,
  };
}

function decodeMemo(memo: xdr.Memo): DecodedMemo {
  switch (memo.type) {
    case "memoNone":
      return { type: "none" };
    case "memoText":
      return { type: "text", ...decodeText(memo.text.bytes) };
    case "memoId":
      return { type: "id", id: memo.id };
    case "memoHash":
      return { type: "hash", hex: bytesHex(memo.hash.value) };
    case "memoReturn":
      return { type: "return", hex: bytesHex(memo.retHash.value) };
    default:
      return assertNever(memo);
  }
}

function timeBounds(cond: xdr.Preconditions): xdr.TimeBounds | null {
  switch (cond.type) {
    case "precondNone":
      return null;
    case "precondTime":
      return cond.timeBounds;
    case "precondV2":
      return cond.v2.timeBounds;
    default:
      return assertNever(cond);
  }
}

type Inner = Omit<DecodedTransaction, "kind" | "envelopeType" | "feeBump">;

function decodeInner(
  source: string,
  tx: {
    fee: number;
    seqNum: bigint;
    memo: xdr.Memo;
    operations: xdr.Operation[];
  },
  bounds: xdr.TimeBounds | null,
): Inner {
  const maxTime = bounds?.maxTime ?? 0n;
  return {
    source,
    feeStroops: BigInt(tx.fee),
    sequence: tx.seqNum,
    memo: decodeMemo(tx.memo),
    operations: tx.operations.map(decodeOperation),
    maxTime: maxTime === 0n ? null : maxTime,
  };
}

function decodeV1(tx: xdr.Transaction): Inner {
  return decodeInner(muxedAddress(tx.sourceAccount), tx, timeBounds(tx.cond));
}

export function decodeTransactionEnvelope(xdrBase64: string, network: NetworkId): DecodedEnvelope {
  const env = parseEnvelope(xdrBase64);
  const { hashHex, innerHashHex } = hashes(env, network);
  let decoded: DecodedTransaction;
  switch (env.type) {
    case "envelopeTypeTxV0": {
      // Pre-protocol-13 layout; the network hashes and applies it as a v1 transaction.
      const tx = env.v0.tx;
      const source = StrKey.encodeEd25519PublicKey(tx.sourceAccountEd25519.value);
      decoded = {
        kind: "transaction",
        envelopeType: "tx",
        ...decodeInner(source, tx, tx.timeBounds),
        feeBump: null,
      };
      break;
    }
    case "envelopeTypeTx":
      decoded = { kind: "transaction", envelopeType: "tx", ...decodeV1(env.v1.tx), feeBump: null };
      break;
    case "envelopeTypeTxFeeBump": {
      const outer = env.feeBump.tx;
      if (innerHashHex === null) throw invalidInput("Not a transaction envelope");
      decoded = {
        kind: "transaction",
        envelopeType: "txFeeBump",
        ...decodeV1(outer.innerTx.v1.tx),
        feeBump: {
          feeSource: muxedAddress(outer.feeSource),
          maxFeeStroops: outer.fee,
          innerHashHex,
        },
      };
      break;
    }
    default:
      return assertNever(env);
  }
  return { decoded, hashHex };
}
