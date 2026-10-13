import { StellixError } from "./errors.js";

// Password policy (KEY_MANAGEMENT §5). No external library; no hints stored.

export const PASSWORD_MIN_LENGTH = 8;

export type PasswordStrength = "weak" | "fair" | "good" | "strong";

/** Length in Unicode code points (Intl.Segmenter isn't reliably available on React Native). */
function codePointLength(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);
    // A high surrogate followed by a low surrogate is one code point.
    if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i++;
    }
    n++;
  }
  return n;
}

/** Enforced in the SW; the UI checks the same rule first for inline feedback. */
export function assertPasswordPolicy(password: string): void {
  if (codePointLength(password) < PASSWORD_MIN_LENGTH) {
    throw new StellixError("INVALID_REQUEST", "Password is too short");
  }
}

/** Length plus character classes (KEY_MANAGEMENT §5). Advisory only. */
export function passwordStrength(password: string): PasswordStrength {
  const length = codePointLength(password);
  if (length < PASSWORD_MIN_LENGTH) return "weak";
  const classes = [/[a-z]/u, /[A-Z]/u, /[0-9]/u, /[^A-Za-z0-9]/u].filter((re) =>
    re.test(password),
  ).length;
  const score =
    (length >= 12 ? 1 : 0) +
    (length >= 16 ? 1 : 0) +
    (classes >= 3 ? 1 : 0) +
    (classes === 4 ? 1 : 0);
  if (score >= 3) return "strong";
  if (score === 2) return "good";
  return "fair";
}
