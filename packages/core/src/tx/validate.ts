import { MuxedAccount } from "@stellar/stellar-sdk/base";
import { StellixError } from "../errors.js";
import { isAccountId, isMuxedAddress, looksLikeSecretSeed } from "../stellar/address.js";
import { parseXlm } from "../stellar/amount.js";

// Payment input validation (TRANSACTIONS §2). Runs in the popup for feedback and again in the SW.

export const MEMO_TEXT_MAX_BYTES = 28;
const UINT64_MAX = 2n ** 64n - 1n;

export interface PaymentInput {
  destination: string;
  amount: string;
  memo?: { type: "text" | "id"; value: string } | undefined;
}

export type MemoSpec =
  { type: "none" } | { type: "text"; value: string } | { type: "id"; value: string };

export interface ValidatedPayment {
  /** Trimmed, as entered (G or M). */
  destination: string;
  /** The G account that must exist (decoded from M if muxed). */
  destinationBase: string;
  muxed: boolean;
  amountStroops: bigint;
  memo: MemoSpec;
}

export function memoTextBytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function validateDestination(
  input: string,
  sourcePublicKey: string,
): Pick<ValidatedPayment, "destination" | "destinationBase" | "muxed"> {
  const destination = input.trim();
  if (looksLikeSecretSeed(destination)) {
    throw new StellixError("SECRET_KEY_ENTERED", "A secret key was entered as the destination");
  }
  let destinationBase: string;
  let muxed = false;
  if (isAccountId(destination)) {
    destinationBase = destination;
  } else if (isMuxedAddress(destination)) {
    destinationBase = MuxedAccount.fromAddress(destination, "0").baseAccount().accountId();
    muxed = true;
  } else {
    throw new StellixError("INVALID_ADDRESS", "Not a Stellar account address");
  }
  if (destinationBase === sourcePublicKey)
    throw new StellixError("SELF_PAYMENT", "Destination is the source account");
  return { destination, destinationBase, muxed };
}

export function validateMemo(memo: PaymentInput["memo"], muxed: boolean): MemoSpec {
  if (memo === undefined || memo.value === "") return { type: "none" };
  if (muxed) throw new StellixError("MEMO_WITH_MUXED", "A muxed address already carries an ID");
  if (memo.type === "text") {
    if (memoTextBytes(memo.value) > MEMO_TEXT_MAX_BYTES)
      throw new StellixError("MEMO_TOO_LONG", "Memo text exceeds 28 bytes");
    return { type: "text", value: memo.value };
  }
  if (!/^\d+$/.test(memo.value) || BigInt(memo.value) > UINT64_MAX) {
    throw new StellixError("INVALID_MEMO_ID", "Memo ID must be an integer from 0 to 2^64 - 1");
  }
  return { type: "id", value: BigInt(memo.value).toString() };
}

/** Every row of TRANSACTIONS §2. */
export function validatePayment(input: PaymentInput, sourcePublicKey: string): ValidatedPayment {
  const dest = validateDestination(input.destination, sourcePublicKey);
  const amountStroops = parseXlm(input.amount.trim());
  if (amountStroops <= 0n)
    throw new StellixError("INVALID_AMOUNT", "Amount must be greater than zero");
  return { ...dest, amountStroops, memo: validateMemo(input.memo, dest.muxed) };
}
