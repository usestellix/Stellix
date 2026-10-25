import { StellixError } from "../errors.js";
import { assetQuery, type AssetRef } from "../network/horizon-client.js";
import type { RuleUnavailable } from "./types.js";

// Shared by the gather step and the rules that read what it fetched.

export function isUnavailable(value: unknown): value is RuleUnavailable {
  return typeof value === "object" && value !== null && "unavailable" in value;
}

/** Maps a lookup's failure to the reason shown in "Checks that couldn't run". */
export function unavailableFrom(error: unknown): RuleUnavailable {
  if (!(error instanceof StellixError)) return { unavailable: true, reason: "internal" };
  switch (error.code) {
    case "NETWORK_ERROR":
    case "RATE_LIMITED":
      return { unavailable: true, reason: "unreachable" };
    case "HORIZON_NOT_FOUND":
      return { unavailable: true, reason: "not_found" };
    case "HORIZON_BAD_RESPONSE":
      return { unavailable: true, reason: "bad_response" };
    default:
      return { unavailable: true, reason: "internal" };
  }
}

/** Key of an asset pair in RuleData maps. */
export function pairKey(selling: AssetRef, buying: AssetRef): string {
  return `${assetQuery("selling_", selling)}&${assetQuery("buying_", buying)}`;
}
