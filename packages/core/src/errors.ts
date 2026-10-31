export const ERROR_CODES = [
  // auth / session
  "LOCKED",
  "INVALID_PASSWORD",
  "VAULT_NOT_FOUND",
  "VAULT_CORRUPT",
  "UNLOCK_THROTTLED",
  // onboarding
  "INVALID_MNEMONIC_WORD",
  "INVALID_MNEMONIC_CHECKSUM",
  "VERIFICATION_FAILED",
  "ONBOARDING_EXPIRED",
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
  "TX_IN_FLIGHT",
  "UNKNOWN_TX_ERROR",
  // network
  "NETWORK_ERROR",
  "RATE_LIMITED",
  "HORIZON_BAD_RESPONSE",
  "HORIZON_NOT_FOUND",
  "NOT_AVAILABLE_ON_NETWORK",
  "FRIENDBOT_FAILED",
  "INVALID_HORIZON_URL",
  // platform
  "CLIPBOARD_UNAVAILABLE",
  // messaging
  "UNAUTHORIZED_SENDER",
  "INVALID_REQUEST",
  // shield (SHIELD.md §8)
  "SHIELD_DIGEST_MISMATCH",
  "SHIELD_REPORT_EXPIRED",
  "SHIELD_BLOCKED",
  "SHIELD_CONFIRMATION_REQUIRED",
  "SHIELD_INPUT_INVALID",
  "SHIELD_INPUT_TOO_LARGE",
  // catch-all
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * Detail keys each code may carry across messaging. Public values only, units in the key name.
 * Anything else is stripped (sanitizeErrorDetails), on both the SW and UI sides.
 */
export const ERROR_DETAIL_KEYS = {
  INSUFFICIENT_BALANCE: ["maxSendableStroops"],
  UNKNOWN_TX_ERROR: ["resultCode"],
  // Mode C: a web+stellar:tx link naming a network other than the one selected.
  SHIELD_INPUT_INVALID: ["linkNetwork"],
} as const satisfies Partial<Record<ErrorCode, readonly string[]>>;

export type ErrorDetails = Readonly<Record<string, string>>;

export function sanitizeErrorDetails(code: ErrorCode, details: unknown): ErrorDetails | undefined {
  const allowed: readonly string[] =
    (ERROR_DETAIL_KEYS as Partial<Record<ErrorCode, readonly string[]>>)[code] ?? [];
  if (allowed.length === 0 || typeof details !== "object" || details === null) return undefined;
  const out: Record<string, string> = {};
  for (const key of allowed) {
    const value = (details as Record<string, unknown>)[key];
    if (typeof value === "string") out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * The only error type core throws. `message` is developer-facing and must never contain
 * secret material; user-facing copy comes from the shell's errorCopy table, keyed by `code`.
 */
export class StellixError extends Error {
  override readonly name = "StellixError";

  /** Public, allowlisted details only (ERROR_DETAIL_KEYS). */
  public readonly details: ErrorDetails | undefined;

  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly retryable = false,
    details?: ErrorDetails,
  ) {
    super(message);
    this.details = sanitizeErrorDetails(code, details);
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
