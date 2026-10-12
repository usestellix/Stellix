export const ERROR_CODES = [
  // auth / session
  "LOCKED",
  "INVALID_PASSWORD",
  "VAULT_NOT_FOUND",
  "VAULT_CORRUPT",
  // onboarding
  "INVALID_MNEMONIC_WORD",
  "INVALID_MNEMONIC_CHECKSUM",
  "VERIFICATION_FAILED",
  // input
  "INVALID_ADDRESS",
  "SECRET_KEY_ENTERED",
  "SELF_PAYMENT",
  "INVALID_AMOUNT",
  "MEMO_TOO_LONG",
  "INVALID_MEMO_ID",
  "MEMO_WITH_MUXED",
  "MEMO_REQUIRED",
  // account state
  "SOURCE_UNFUNDED",
  "MULTISIG_UNSUPPORTED",
  "MUXED_DESTINATION_UNFUNDED",
  "INSUFFICIENT_BALANCE",
  "BELOW_MIN_STARTING_BALANCE",
  // tx lifecycle
  "PREPARED_TX_NOT_FOUND",
  "PREPARED_TX_EXPIRED",
  "NETWORK_MISMATCH",
  "SIGNING_FAILED",
  "FEE_TOO_LOW",
  "CLOCK_SKEW",
  "TX_EXPIRED_NOT_INCLUDED",
  "DESTINATION_UNFUNDED_RACE",
  "DESTINATION_CREATED_RACE",
  "UNKNOWN_TX_ERROR",
  // network
  "NETWORK_ERROR",
  "RATE_LIMITED",
  "HORIZON_BAD_RESPONSE",
  "HORIZON_NOT_FOUND",
  "NOT_AVAILABLE_ON_NETWORK",
  "INVALID_HORIZON_URL",
  // messaging
  "UNAUTHORIZED_SENDER",
  "INVALID_REQUEST",
  // catch-all
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * The only error type core throws. `message` is developer-facing and must never contain
 * secret material; user-facing copy comes from the shell's errorCopy table, keyed by `code`.
 */
export class StellixError extends Error {
  override readonly name = "StellixError";

  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
  }
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}

export function isStellixError(value: unknown): value is StellixError {
  return value instanceof StellixError;
}

/**
 * Converts anything thrown into a StellixError. Unknown values become INTERNAL_ERROR with a
 * fixed message: the original may carry secrets or raw SDK/Horizon text, so it is never copied.
 */
export function toStellixError(value: unknown): StellixError {
  if (isStellixError(value)) return value;
  return new StellixError("INTERNAL_ERROR", "Unexpected internal error");
}
