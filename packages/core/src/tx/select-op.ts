import { StellixError } from "../errors.js";

// STELLAR_PRIMER §2 decision table.
export type PaymentKind = "payment" | "createAccount";

export function selectOperation(muxed: boolean, destinationExists: boolean): PaymentKind {
  if (destinationExists) return "payment";
  if (muxed)
    throw new StellixError(
      "MUXED_DESTINATION_UNFUNDED",
      "Muxed destination's base account doesn't exist",
    );
  return "createAccount";
}
