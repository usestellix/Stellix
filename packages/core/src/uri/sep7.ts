import { StellixError } from "../errors.js";
import { NETWORKS, type NetworkId } from "../network/config.js";
import { isAccountId } from "../stellar/address.js";
import { formatXlm } from "../stellar/amount.js";
import { validateMemo, type MemoSpec } from "../tx/validate.js";

// SEP-7 `pay` request links (UI_FLOWS §6), encode only. Spec:
// https://github.com/stellar/stellar-protocol/blob/af35d0c/ecosystem/sep-0007.md
// - `destination` required; `amount` optional (omitted → the payer chooses).
// - No asset_code / asset_issuer: XLM is the default when absent.
// - `network_passphrase` "only need to set if this transaction is for a network other than the
//   public network", so testnet links carry it and mainnet links don't.

export const SEP7_SCHEME = "web+stellar:";

export interface PayRequest {
  /** The receiving account: our own G address (never muxed). */
  destination: string;
  /** Omitted → no amount in the link. */
  amountStroops?: bigint | undefined;
  memo?: { type: "text" | "id"; value: string } | undefined;
  network: NetworkId;
}

/** Percent-encode per RFC 3986: encodeURIComponent leaves !'()* unescaped. */
function encode(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

const MEMO_TYPE: Record<Exclude<MemoSpec["type"], "none">, string> = {
  text: "MEMO_TEXT",
  id: "MEMO_ID",
};

export function encodePayRequest(request: PayRequest): string {
  if (!isAccountId(request.destination))
    throw new StellixError("INVALID_ADDRESS", "Payment request destination must be a G address");
  const params: [string, string][] = [["destination", request.destination]];
  if (request.amountStroops !== undefined) {
    if (request.amountStroops <= 0n)
      throw new StellixError("INVALID_AMOUNT", "Amount must be greater than zero");
    params.push(["amount", formatXlm(request.amountStroops, { trimZeros: true })]);
  }
  const memo = validateMemo(request.memo, false);
  if (memo.type !== "none") {
    params.push(["memo", memo.value], ["memo_type", MEMO_TYPE[memo.type]]);
  }
  if (request.network !== "mainnet") {
    params.push(["network_passphrase", NETWORKS[request.network].passphrase]);
  }
  return `${SEP7_SCHEME}pay?${params.map(([k, v]) => `${k}=${encode(v)}`).join("&")}`;
}
