import { sha256 } from "@noble/hashes/sha2.js";
import { base64 } from "@scure/base";
import { xdr } from "@stellar/stellar-sdk/base";
import { assertNever } from "../../assert-never.js";
import { NETWORKS, type NetworkId } from "../../network/config.js";
import type { DecodedMemo, DecodedTransaction } from "../types.js";
import { decodeOperation } from "./operations.js";
import { decodePreconditions } from "./preconditions.js";
import { bytesHex, decodeText, invalidInput, muxedAddress } from "./xdr-values.js";

// TransactionEnvelope and FeeBumpTransactionEnvelope → DecodedTransaction (SHIELD §3.1, §5).
// The XDR parser rejects truncated input, trailing bytes and unknown union arms, so anything
// that isn't exactly one transaction envelope fails here with SHIELD_INPUT_INVALID.

export interface DecodedEnvelope {
  decoded: DecodedTransaction;
  /** Transaction hash (fee bump: the fee-bump hash) under the request's network. */
  hashHex: string;
}

/**
 * The XDR parser accepts lenient base64 (whitespace, missing padding, URL-safe characters), so
 * one transaction would have many accepted spellings. Only the canonical one is accepted.
 */
function isCanonicalBase64(input: string): boolean {
  try {
    return base64.encode(base64.decode(input)) === input;
  } catch {
    return false;
  }
}

function parseEnvelope(xdrBase64: string): xdr.TransactionEnvelope {
  // Never echo the input: it's untrusted and may be large.
  if (!isCanonicalBase64(xdrBase64)) throw invalidInput("Envelope is not canonical base64");
  try {
    return xdr.TransactionEnvelope.fromXdr(xdrBase64, "base64");
  } catch {
    throw invalidInput("Not a transaction envelope");
  }
}

/**
 * sha256 of the TransactionSignaturePayload: what the network signs and calls the transaction
 * hash (SHIELD §5). Computed from the XDR itself, so it doesn't depend on the SDK's high-level
 * classes accepting every operation.
 */
function payloadHash(
  network: NetworkId,
  tagged: xdr.TransactionSignaturePayloadTaggedTransaction,
): string {
  const networkId = new xdr.Hash(sha256(new TextEncoder().encode(NETWORKS[network].passphrase)));
  const payload = new xdr.TransactionSignaturePayload({ networkId, taggedTransaction: tagged });
  return bytesHex(sha256(payload.toXdr()));
}

/** A pre-protocol-13 v0 transaction as the network applies and hashes it: as v1. */
function v0AsV1(tx: xdr.TransactionV0): xdr.Transaction {
  return new xdr.Transaction({
    sourceAccount: xdr.MuxedAccount.keyTypeEd25519(tx.sourceAccountEd25519),
    fee: tx.fee,
    seqNum: tx.seqNum,
    cond:
      tx.timeBounds === null
        ? xdr.Preconditions.precondNone()
        : xdr.Preconditions.precondTime(tx.timeBounds),
    memo: tx.memo,
    operations: tx.operations,
    ext: xdr.TransactionExt.v0(),
  });
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

type Inner = Omit<DecodedTransaction, "kind" | "envelopeType" | "feeBump">;

function decodeV1(tx: xdr.Transaction): Inner {
  const preconditions = decodePreconditions(tx.cond);
  return {
    source: muxedAddress(tx.sourceAccount),
    feeStroops: BigInt(tx.fee),
    sequence: tx.seqNum,
    memo: decodeMemo(tx.memo),
    operations: tx.operations.map(decodeOperation),
    maxTime: preconditions.timeBounds?.maxTime ?? null,
    preconditions,
  };
}

function decodeTx(tx: xdr.Transaction, network: NetworkId): DecodedEnvelope {
  return {
    decoded: { kind: "transaction", envelopeType: "tx", ...decodeV1(tx), feeBump: null },
    hashHex: payloadHash(
      network,
      xdr.TransactionSignaturePayloadTaggedTransaction.envelopeTypeTx(tx),
    ),
  };
}

export function decodeTransactionEnvelope(xdrBase64: string, network: NetworkId): DecodedEnvelope {
  const env = parseEnvelope(xdrBase64);
  switch (env.type) {
    case "envelopeTypeTxV0":
      return decodeTx(v0AsV1(env.v0.tx), network);
    case "envelopeTypeTx":
      return decodeTx(env.v1.tx, network);
    case "envelopeTypeTxFeeBump": {
      const outer = env.feeBump.tx;
      const inner = outer.innerTx.v1.tx;
      const tagged = xdr.TransactionSignaturePayloadTaggedTransaction;
      return {
        decoded: {
          kind: "transaction",
          envelopeType: "txFeeBump",
          ...decodeV1(inner),
          feeBump: {
            feeSource: muxedAddress(outer.feeSource),
            maxFeeStroops: outer.fee,
            innerHashHex: payloadHash(network, tagged.envelopeTypeTx(inner)),
          },
        },
        hashHex: payloadHash(network, tagged.envelopeTypeTxFeeBump(outer)),
      };
    }
    default:
      return assertNever(env);
  }
}
