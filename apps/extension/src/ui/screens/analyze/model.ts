import type { ErrorCode, NetworkId } from "@stellix/core";
import type { RequestResult } from "../../../messaging/protocol.js";
import { errorCopy } from "../../errorCopy.js";

// Pure helpers behind the Analyze screen (Mode C, #35), unit-tested without a DOM.

export type AnalyzeView = RequestResult<"SHIELD_ANALYZE">;

export const NETWORK_NAMES: Record<NetworkId, string> = { testnet: "Testnet", mainnet: "Mainnet" };

/**
 * The error line under the input. A web+stellar:tx link for another network gets its own
 * message, naming the link's network and whether this build offers it.
 */
export function analyzeErrorText(
  code: ErrorCode,
  details: Readonly<Record<string, string>> | undefined,
  enabledNetworks: readonly NetworkId[],
): string {
  const link = details?.linkNetwork;
  if (code === "SHIELD_INPUT_INVALID" && (link === "testnet" || link === "mainnet")) {
    const name = NETWORK_NAMES[link];
    return enabledNetworks.includes(link)
      ? `This link is for ${name}. Choose ${name} above to analyze it.`
      : `This link is for ${name}, which this version of Stellix doesn't offer.`;
  }
  return errorCopy(code);
}

/** Memo text is the requester's words: quoted, never Stellix's (invariant 17). */
export function memoText(memo: AnalyzeView["transaction"]["memo"]): string | null {
  switch (memo.type) {
    case "none":
      return null;
    case "text":
      return memo.text === null ? `Text (not UTF-8), hex ${memo.hex}` : `“${memo.text}”`;
    case "id":
      return `ID ${memo.value}`;
    case "hash":
      return `Hash ${memo.hex}`;
    case "return":
      return `Return hash ${memo.hex}`;
  }
}
