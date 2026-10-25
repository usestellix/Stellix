import type { DecodedClaimant, DecodedClaimPredicate } from "../decode/operation-types.js";

// Plain-language claim conditions for createClaimableBalance. Exact, not rounded: a condition
// that reads looser or tighter than it is would mislead.

const UNITS = [
  ["day", 86_400n],
  ["hour", 3_600n],
  ["minute", 60n],
  ["second", 1n],
] as const;

/** "1 day 2 hours 5 seconds"; every non-zero unit, so it's exact. */
export function formatDuration(seconds: bigint): string {
  if (seconds === 0n) return "0 seconds";
  const parts: string[] = [];
  let rest = seconds;
  for (const [name, size] of UNITS) {
    const n = rest / size;
    rest %= size;
    if (n > 0n) parts.push(`${n.toString()} ${name}${n === 1n ? "" : "s"}`);
  }
  return parts.join(" ");
}

/** 9999-12-31 23:59:59 UTC: the last second with a four-digit year. */
const MAX_DATE_SECONDS = 253_402_300_799n;

/** "2027-10-25 11:23:58 UTC", or the raw Unix time after year 9999. */
export function formatEpochSeconds(epochSeconds: bigint): string {
  if (epochSeconds > MAX_DATE_SECONDS) return `Unix time ${epochSeconds.toString()}`;
  const iso = new Date(Number(epochSeconds) * 1000).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} UTC`;
}

function compound(p: DecodedClaimPredicate): string {
  const text = describePredicate(p);
  return p.type === "and" || p.type === "or" ? `(${text})` : text;
}

/** E.g. "before 2027-10-25 11:23:58 UTC", "(at any time) or (within 1 hour of creation)". */
export function describePredicate(p: DecodedClaimPredicate): string {
  switch (p.type) {
    case "unconditional":
      return "at any time";
    case "beforeAbsoluteTime":
      return `before ${formatEpochSeconds(p.epochSeconds)}`;
    case "beforeRelativeTime":
      return `within ${formatDuration(p.seconds)} of creation`;
    case "not": {
      const inner = p.predicate;
      if (inner.type === "beforeAbsoluteTime")
        return `at or after ${formatEpochSeconds(inner.epochSeconds)}`;
      if (inner.type === "beforeRelativeTime")
        return `at least ${formatDuration(inner.seconds)} after creation`;
      if (inner.type === "unconditional") return "never";
      return `unless ${compound(inner)}`;
    }
    case "and":
      return `${compound(p.predicates[0])} and ${compound(p.predicates[1])}`;
    case "or":
      return `${compound(p.predicates[0])} or ${compound(p.predicates[1])}`;
  }
}

/** "G… can claim it at any time". The address is shown in full: it's what the user checks. */
export function describeClaimant(c: DecodedClaimant): string {
  return `${c.destination} can claim it ${describePredicate(c.predicate)}`;
}
