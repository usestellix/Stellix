import type { ErrorCode } from "@stellix/core";

// The single source of user-facing error text (ARCHITECTURE §7). Keyed by ErrorCode; a test
// asserts every code has copy. Entries marked "TRANSACTIONS §8" are copied from that doc;
// the rest are drafts pending product review.
export const ERROR_COPY: Readonly<Record<ErrorCode, string>> = {
  // auth / session
  LOCKED: "Your wallet is locked. Unlock it to continue.",
  INVALID_PASSWORD: "That password isn't right. Try again.",
  VAULT_NOT_FOUND: "No wallet found on this device. Create or import one to get started.",
  VAULT_CORRUPT: "Your wallet data couldn't be read. Restore it with your recovery phrase.",
  UNLOCK_THROTTLED: "Too many attempts. Wait 30 seconds and try again.",
  // onboarding
  INVALID_MNEMONIC_WORD:
    "One or more words aren't in the recovery phrase word list. Check the highlighted words.",
  INVALID_MNEMONIC_CHECKSUM: "This recovery phrase isn't valid. Check the words and their order.",
  VERIFICATION_FAILED: "That word doesn't match your recovery phrase. Check what you wrote down.",
  ONBOARDING_EXPIRED: "This setup session expired. Start again — you'll get a new recovery phrase.",
  // input
  INVALID_ADDRESS: "This isn't a valid Stellar address. Addresses start with G or M.",
  SECRET_KEY_ENTERED:
    "This is a secret key, not an address. Never share it. Anyone who has it can take your funds.",
  SELF_PAYMENT: "You can't send to your own account.",
  INVALID_AMOUNT: "Enter an amount greater than 0 with at most 7 decimal places.",
  MEMO_TOO_LONG: "This memo is too long. Text memos can be up to 28 bytes.",
  INVALID_MEMO_ID: "A memo ID must be a whole number.",
  MEMO_WITH_MUXED:
    "This address already includes a recipient ID, so a memo isn't needed. Remove the memo to continue.",
  MEMO_REQUIRED:
    "This destination requires a memo. Add the memo you were given, or your funds may be lost.",
  // account state
  SOURCE_UNFUNDED: "Your account isn't active yet. It needs at least 1 XLM before it can send.",
  MULTISIG_UNSUPPORTED: "This account uses multiple signers, which Stellix doesn't support yet.",
  MUXED_DESTINATION_UNFUNDED:
    "This recipient account doesn't exist yet. Ask them for a regular G address to activate it.",
  INSUFFICIENT_BALANCE: "You don't have enough available XLM for this payment and its fee.",
  BELOW_MIN_STARTING_BALANCE:
    "New accounts need at least 1 XLM to be activated. Send a larger amount.",
  // tx lifecycle
  PREPARED_TX_NOT_FOUND: "This payment is no longer available. Review it again.",
  PREPARED_TX_EXPIRED: "This took too long. Review again.", // TRANSACTIONS §8
  NETWORK_MISMATCH: "The network changed since you reviewed this payment. Review it again.",
  SIGNING_FAILED: "Couldn't authorize this transaction.", // TRANSACTIONS §8
  FEE_TOO_LOW: "Network is busy. Try again with a higher fee.", // TRANSACTIONS §8
  CLOCK_SKEW: "Your computer's clock looks wrong.", // TRANSACTIONS §8
  TX_EXPIRED_NOT_INCLUDED: "This payment wasn't processed and no funds moved. You can try again.",
  DESTINATION_UNFUNDED_RACE: "The recipient account no longer exists. Review the payment again.",
  DESTINATION_CREATED_RACE: "The recipient account was just activated. Review the payment again.",
  TX_IN_FLIGHT: "Your previous payment is still confirming. Try again in a moment.",
  UNKNOWN_TX_ERROR: "The network rejected this transaction. See details below.",
  // network
  NETWORK_ERROR: "Couldn't reach the Stellar network. Check your connection and try again.",
  RATE_LIMITED: "Too many requests right now. Wait a moment and try again.",
  HORIZON_BAD_RESPONSE: "The network server sent an unexpected response. Try again later.",
  HORIZON_NOT_FOUND: "That couldn't be found on the network.",
  NOT_AVAILABLE_ON_NETWORK: "This isn't available on the current network.",
  FRIENDBOT_FAILED: "Friendbot couldn't fund this account. Try again in a minute.",
  INVALID_HORIZON_URL: "This server URL isn't valid for the selected network.",
  // messaging
  UNAUTHORIZED_SENDER: "This request was blocked for your security.",
  INVALID_REQUEST: "Something went wrong. Close and reopen Stellix.",
  // catch-all
  INTERNAL_ERROR: "Something went wrong. Close and reopen Stellix.",
};

export function errorCopy(code: ErrorCode): string {
  return ERROR_COPY[code];
}
