import { StellixError } from "../errors.js";
import type { ResultCodes } from "./result-codes.js";
import type { PaymentKind } from "./select-op.js";

// TRANSACTIONS §8. A failure either asks the popup to rebuild (re-prepare with the same inputs and
// show a new review) or is a terminal, mapped StellixError.

export type RebuildReason = "bad_seq" | "destination_changed";

export type MappedFailure =
  { kind: "rebuild"; reason: RebuildReason } | { kind: "failed"; error: StellixError };

const failed = (error: StellixError): MappedFailure => ({ kind: "failed", error });

export function mapResultCodes(codes: ResultCodes, opKind: PaymentKind): MappedFailure {
  const op = codes.operations?.find((c) => c !== "op_success");
  switch (codes.transaction) {
    case "tx_bad_seq":
      return { kind: "rebuild", reason: "bad_seq" };
    case "tx_too_late":
      return failed(
        new StellixError("PREPARED_TX_EXPIRED", "Transaction expired before inclusion"),
      );
    case "tx_too_early":
      return failed(new StellixError("CLOCK_SKEW", "Transaction not yet valid"));
    case "tx_insufficient_fee":
      return failed(new StellixError("FEE_TOO_LOW", "Fee too low", true));
    case "tx_insufficient_balance":
      return failed(new StellixError("INSUFFICIENT_BALANCE", "Can't pay the fee"));
    case "tx_bad_auth":
      return failed(new StellixError("SIGNING_FAILED", "Bad authorization"));
    case "tx_no_source_account":
      return failed(new StellixError("SOURCE_UNFUNDED", "Source account doesn't exist"));
    case "tx_failed":
      switch (op) {
        case "op_underfunded":
          return failed(new StellixError("INSUFFICIENT_BALANCE", "Not enough XLM"));
        case "op_low_reserve":
          return failed(
            opKind === "createAccount"
              ? new StellixError("BELOW_MIN_STARTING_BALANCE", "Below minimum starting balance")
              : new StellixError("INSUFFICIENT_BALANCE", "Would drop below reserve"),
          );
        case "op_no_destination":
          return { kind: "rebuild", reason: "destination_changed" };
        case "op_already_exists":
          return { kind: "rebuild", reason: "destination_changed" };
        case "op_malformed":
          return failed(new StellixError("INTERNAL_ERROR", "Malformed operation"));
        default:
          return unknown(op ?? codes.transaction);
      }
    default:
      return unknown(codes.transaction);
  }
}

function unknown(resultCode: string): MappedFailure {
  return failed(new StellixError("UNKNOWN_TX_ERROR", "Unrecognized result", false, { resultCode }));
}
