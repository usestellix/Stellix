import { base64 } from "@scure/base";
import type { AccountRecord } from "../network/horizon-schemas.js";

// SEP-29 (stellar-protocol @ af35d0c): data entry `config.memo_required` = "1". Horizon returns data
// values base64-encoded ("MQ=="). Muxed destinations are exempt (the caller checks that).

export const MEMO_REQUIRED_KEY = "config.memo_required";

export function requiresMemo(account: AccountRecord): boolean {
  const raw = account.data[MEMO_REQUIRED_KEY];
  if (raw === undefined) return false;
  try {
    return new TextDecoder().decode(base64.decode(raw)) === "1";
  } catch {
    return false;
  }
}
