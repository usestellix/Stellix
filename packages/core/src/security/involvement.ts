import { resolveSources } from "./decode/sources.js";
import { listOutflows } from "./rules/UNNAMED_OUTFLOW.js";
import type { DecodedRequest } from "./types.js";

// Mode C's perspective (#35): rules run relative to the active account, so a pasted transaction
// that never acts on it passes every account-relative rule without saying anything. The Analyze
// screen says so instead of looking clean.

/**
 * Whether the request spends from or acts as `account`: it is the transaction source, the fee
 * source, an operation's effective source (muxed included), or the source of an outflow.
 */
export function spendsFromAccount(decoded: DecodedRequest, account: string): boolean {
  const sources = resolveSources(decoded, account);
  return (
    sources.tx.isUser ||
    sources.fee.isUser ||
    sources.ops.some((op) => op.isUser) ||
    listOutflows(decoded, account).length > 0
  );
}
