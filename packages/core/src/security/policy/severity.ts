import { SEVERITIES, type Severity } from "../types.js";

// Severity order (SHIELD §6): info < low < medium < high < critical. The highest finding wins;
// severities are compared, never added or averaged (invariant 20).

/** Negative if `a` is lower than `b`, 0 if equal, positive if higher. */
export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITIES.indexOf(a) - SEVERITIES.indexOf(b);
}

/** The highest severity in `severities`, or null when there are none. */
export function maxSeverity(severities: Iterable<Severity>): Severity | null {
  let max: Severity | null = null;
  for (const s of severities) if (max === null || compareSeverity(s, max) > 0) max = s;
  return max;
}
