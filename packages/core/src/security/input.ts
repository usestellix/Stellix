import { StellixError } from "../errors.js";
import { NETWORKS, NETWORK_IDS, type NetworkId } from "../network/config.js";

// Mode C input (SHIELD §2, §8 SHIELD_ANALYZE): a transaction envelope as base64 XDR, or a SEP-7
// `web+stellar:tx` link carrying one. Spec (v2.1.0):
// https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0007.md
// - `xdr` is required; `network_passphrase` is only set for networks other than the public
//   network, so a link without it is for mainnet.
// - `replace` marks fields the wallet should fill in (SEP-11 Txrep): the envelope is a template,
//   not what anyone would sign, so it's refused.
// - `msg` and `origin_domain` are the requester's words; `origin_domain` may only be shown after
//   its `signature` is verified. Neither is read here (invariant 17). `callback`, `pubkey` and
//   `chain` don't change what the envelope does, so they're ignored.

/**
 * Longest input accepted, in characters. stellar-core caps a classic transaction at 100 KiB
 * (`MAX_CLASSIC_TX_SIZE_BYTES`, src/overlay/Peer.h), 136,536 base64 characters; this leaves room
 * for a link's percent-encoding (`+`, `/`, `=` → 3 characters each).
 */
export const SHIELD_INPUT_MAX_CHARS = 262_144;

export interface AnalyzeInput {
  /** Base64 XDR, not yet decoded (decodeTransactionEnvelope validates it). */
  xdr: string;
  /** The network a link names (mainnet when it names none); null for raw XDR. */
  network: NetworkId | null;
}

function invalid(message: string): never {
  // Never echo the input: it's untrusted and may be large.
  throw new StellixError("SHIELD_INPUT_INVALID", message);
}

function decodeComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return invalid("Link has a malformed escape");
  }
}

function networkFor(passphrase: string): NetworkId {
  const id = NETWORK_IDS.find((n) => NETWORKS[n].passphrase === passphrase);
  return id ?? invalid("Link names an unknown network");
}

function parseLink(link: string): AnalyzeInput {
  const rest = link.slice("web+stellar:".length);
  const q = rest.indexOf("?");
  if ((q === -1 ? rest : rest.slice(0, q)) !== "tx") invalid("Only web+stellar:tx links");
  const params = new Map<string, string>();
  for (const pair of q === -1 ? [] : rest.slice(q + 1).split("&")) {
    if (pair === "") continue;
    const eq = pair.indexOf("=");
    const key = decodeComponent(eq === -1 ? pair : pair.slice(0, eq));
    if (params.has(key)) invalid("Link repeats a parameter");
    params.set(key, eq === -1 ? "" : decodeComponent(pair.slice(eq + 1)));
  }
  if (params.has("replace")) invalid("Link asks the wallet to replace fields");
  const xdr = params.get("xdr");
  if (xdr === undefined || xdr === "") invalid("Link has no xdr");
  const passphrase = params.get("network_passphrase");
  return { xdr, network: passphrase === undefined ? "mainnet" : networkFor(passphrase) };
}

/** SHIELD_INPUT_TOO_LARGE over the limit, SHIELD_INPUT_INVALID for links it can't use. */
export function parseAnalyzeInput(input: string): AnalyzeInput {
  if (input.length > SHIELD_INPUT_MAX_CHARS) {
    throw new StellixError("SHIELD_INPUT_TOO_LARGE", "Input exceeds the size limit");
  }
  const trimmed = input.trim();
  if (trimmed.slice(0, "web+stellar:".length).toLowerCase() === "web+stellar:") {
    return parseLink(trimmed);
  }
  // Pasted XDR is often wrapped across lines; base64 has no whitespace of its own.
  const xdr = trimmed.replace(/\s+/g, "");
  if (xdr === "") invalid("Nothing to analyze");
  return { xdr, network: null };
}
