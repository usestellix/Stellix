import { base64 } from "@scure/base";
import { FeeBumpTransaction, TransactionBuilder } from "@stellar/stellar-sdk/base";
import { StellixError } from "../../errors.js";
import { NETWORKS, type NetworkId } from "../../network/config.js";
import { transactionHashHex } from "../../tx/build.js";
import type { DecodedTransaction } from "../types.js";

// Minimal envelope decoding for the analyze() skeleton. The decoder issues replace the
// placeholder operations and add fee, sequence, memo, sources and preconditions (SHIELD §3.1).

export interface DecodedEnvelope {
  decoded: DecodedTransaction;
  /** Transaction hash (fee bump: the fee-bump hash) under the request's network. */
  hashHex: string;
}

function invalid(reason: string): never {
  // Never echo the input: it's untrusted and may be large.
  throw new StellixError("SHIELD_INPUT_INVALID", reason);
}

/**
 * Parses an envelope and requires its encoding to be canonical: re-encoding it must give back
 * exactly the input. The SDK already rejects non-canonical XDR (trailing bytes, non-zero
 * padding) but accepts lenient base64 (whitespace, missing padding, URL-safe characters), so
 * without this one transaction would have many accepted spellings.
 */
function parseEnvelope(xdr: string, network: NetworkId) {
  let tx;
  let canonical: boolean;
  try {
    tx = TransactionBuilder.fromXdr(xdr, NETWORKS[network].passphrase);
    canonical = base64.encode(base64.decode(xdr)) === tx.toXdr();
  } catch {
    return invalid("Not a transaction envelope");
  }
  return canonical ? tx : invalid("Envelope is not canonically encoded");
}

export function decodeTransactionEnvelope(xdr: string, network: NetworkId): DecodedEnvelope {
  const tx = parseEnvelope(xdr, network);
  const feeBump = tx instanceof FeeBumpTransaction;
  const inner = tx instanceof FeeBumpTransaction ? tx.innerTransaction : tx;
  const maxTime = inner.timeBounds === undefined ? 0n : BigInt(inner.timeBounds.maxTime);
  return {
    decoded: {
      kind: "transaction",
      envelopeType: feeBump ? "txFeeBump" : "tx",
      // The SDK splits revokeSponsorship into one type per variant; XDR has one.
      operations: inner.operations.map((op) => ({
        kind: "undecoded",
        opType: op.type.startsWith("revoke") ? "revokeSponsorship" : op.type,
      })),
      maxTime: maxTime === 0n ? null : maxTime,
    },
    hashHex: transactionHashHex(tx),
  };
}
