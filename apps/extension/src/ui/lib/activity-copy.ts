import type { HistoryItem } from "@stellix/core";
import { truncateAddress } from "../components/address.js";
import { displayXlm } from "./xlm.js";

// Activity wording (UI_FLOWS §7), shared by the Home list, the History screen and the detail.

export function activityTitle(item: HistoryItem): string {
  const who = truncateAddress(item.counterparty);
  switch (item.kind) {
    case "payment":
      return item.direction === "in"
        ? `Received from ${who}`
        : item.direction === "out"
          ? `Sent to ${who}`
          : "Sent to yourself";
    case "account_created":
      return item.direction === "in" ? `Account activated by ${who}` : `Activated ${who}`;
    case "account_merged":
      return item.direction === "in" ? `Merged in from ${who}` : `Merged into ${who}`;
  }
}

/** Short heading for the detail screen. */
export function activityHeading(item: HistoryItem): string {
  switch (item.kind) {
    case "payment":
      return item.direction === "in" ? "Received" : "Sent";
    case "account_created":
      return item.direction === "in" ? "Account activated" : "Activated an account";
    case "account_merged":
      return "Account merge";
  }
}

/** "+12.5", "−3" (U+2212), "12.5" for self; null amount (merge not loaded yet) → null. */
export function signedAmount(item: HistoryItem): string | null {
  if (item.amountStroops === null) return null;
  const value = displayXlm(BigInt(item.amountStroops));
  return item.direction === "in" ? `+${value}` : item.direction === "out" ? `−${value}` : value;
}

export function memoLabel(memo: NonNullable<HistoryItem["memo"]>): string {
  return memo.type === "id" ? `ID ${memo.value}` : memo.value;
}

/** Fee wording (NETWORK §5): one fee covers every operation of a multi-op transaction. */
export function feeLabel(fee: NonNullable<HistoryItem["fee"]>): {
  label: string;
  note: string | null;
} {
  return fee.operationCount > 1
    ? {
        label: "Transaction fee",
        note: `Paid once for all ${String(fee.operationCount)} operations in this transaction.`,
      }
    : { label: "Network fee", note: null };
}
