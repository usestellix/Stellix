import { formatXlm } from "@stellix/core";

/** Display formatting: grouped, trailing zeros trimmed. Never truncated (break-ui rule). */
export function displayXlm(stroops: bigint): string {
  return formatXlm(stroops, { trimZeros: true, group: true });
}

export function asOfTime(at: number): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}
