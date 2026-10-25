import { extractBaseAddress } from "@stellar/stellar-sdk/base";
import type { DecodedTransaction } from "../types.js";

// Effective sources (SHIELD §6.6): an op's source is `op.source ?? tx.source`; for a fee bump
// that is the inner transaction's source, and the fee source only pays the fee. An address is
// the user's when its base account (an M… address's underlying G…) is the user's G….
// Marking only: what a user-sourced op means is for the rules (#27, #28, #33).

export interface ResolvedSource {
  /** As written: G… or M…. */
  address: string;
  /** The G… account that signs and pays: `address` itself, or the account an M… is muxed on. */
  account: string;
  isUser: boolean;
}

export interface OpSource extends ResolvedSource {
  /** True when the op names its own source; false when it inherits the transaction's. */
  explicit: boolean;
}

export interface DecodedSources {
  /** The (inner) transaction's source: the default source of every op. */
  tx: ResolvedSource;
  /** Who pays the fee: the fee-bump fee source, or else the transaction's source. */
  fee: ResolvedSource;
  /** One per operation, in order. */
  ops: readonly OpSource[];
}

function resolve(address: string, userAccount: string): ResolvedSource {
  const account = extractBaseAddress(address);
  return { address, account, isUser: account === userAccount };
}

/** `userAccount` is the active G… (an M… is reduced to its base account, too). */
export function resolveSources(decoded: DecodedTransaction, userAccount: string): DecodedSources {
  const user = extractBaseAddress(userAccount);
  const tx = resolve(decoded.source, user);
  return {
    tx,
    fee: decoded.feeBump === null ? tx : resolve(decoded.feeBump.feeSource, user),
    ops: decoded.operations.map((op) =>
      op.source === null
        ? { ...tx, explicit: false }
        : { ...resolve(op.source, user), explicit: true },
    ),
  };
}
