import {
  encodePayRequest,
  isStellixError,
  parseXlm,
  type ErrorCode,
  type NetworkId,
} from "@stellix/core";

// "Request a specific amount" (UI_FLOWS §6): the draft → a SEP-7 link, or the field to blame.

export interface RequestDraft {
  amount: string;
  memoType: "text" | "id";
  memo: string;
}

export type RequestLink =
  | { kind: "empty" }
  | { kind: "ok"; uri: string; amountStroops: bigint }
  | { kind: "error"; field: "amount" | "memo"; code: ErrorCode };

const MEMO_CODES: readonly ErrorCode[] = ["MEMO_TOO_LONG", "INVALID_MEMO_ID", "MEMO_WITH_MUXED"];

export function requestLink(address: string, network: NetworkId, draft: RequestDraft): RequestLink {
  const amount = draft.amount.trim();
  if (amount === "") return { kind: "empty" };
  try {
    const amountStroops = parseXlm(amount);
    const uri = encodePayRequest({
      destination: address,
      amountStroops,
      memo: { type: draft.memoType, value: draft.memo },
      network,
    });
    return { kind: "ok", uri, amountStroops };
  } catch (err: unknown) {
    const code = isStellixError(err) ? err.code : "INTERNAL_ERROR";
    return { kind: "error", field: MEMO_CODES.includes(code) ? "memo" : "amount", code };
  }
}
