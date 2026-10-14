import { StellixError } from "../errors.js";

// XLM amounts (STELLAR_PRIMER §3). Internally bigint stroops; decimal strings only at the edges.

export const STROOPS_PER_XLM = 10_000_000n;
export const INT64_MAX = 2n ** 63n - 1n;

/** Digits, optionally "." and 1–7 digits. Rejects "", ".", "1.", ".5", signs, exponents, commas. */
const XLM_PATTERN = /^(\d+)(?:\.(\d{1,7}))?$/;

/** Parses a user-entered XLM amount into stroops. Throws INVALID_AMOUNT. Zero is allowed here. */
export function parseXlm(input: string): bigint {
  const match = XLM_PATTERN.exec(input);
  if (match === null) throw new StellixError("INVALID_AMOUNT", "Not a valid XLM amount");
  const [, whole = "0", fraction = ""] = match;
  const stroops = BigInt(whole) * STROOPS_PER_XLM + BigInt(fraction.padEnd(7, "0"));
  if (stroops > INT64_MAX) throw new StellixError("INVALID_AMOUNT", "Amount is too large");
  return stroops;
}

/** Parses a Horizon amount string ("100.0000000"). Throws HORIZON_BAD_RESPONSE. */
export function parseHorizonAmount(value: string): bigint {
  try {
    return parseXlm(value);
  } catch {
    throw new StellixError("HORIZON_BAD_RESPONSE", "Horizon returned an invalid amount");
  }
}

export interface FormatXlmOptions {
  /** Drop trailing fractional zeros (display). Default false: exactly 7 decimals (SDK input). */
  trimZeros?: boolean;
  /** Group the whole part in threes with "," (display). Default false. */
  group?: boolean;
}

export function formatXlm(stroops: bigint, options: FormatXlmOptions = {}): string {
  const negative = stroops < 0n;
  const abs = negative ? -stroops : stroops;
  let whole = (abs / STROOPS_PER_XLM).toString();
  let fraction = (abs % STROOPS_PER_XLM).toString().padStart(7, "0");
  if (options.group === true) whole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (options.trimZeros === true) fraction = fraction.replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction === "" ? "" : `.${fraction}`}`;
}
