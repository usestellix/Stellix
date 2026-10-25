import { describe, expect, it } from "vitest";
import { fixture } from "../../__fixtures__/load.js";
import { decodeTransactionEnvelope } from "../../decode/envelope.js";
import type { DecodedClaimPredicate } from "../../decode/operation-types.js";
import {
  describeClaimant,
  describePredicate,
  formatDuration,
  formatEpochSeconds,
} from "../predicate.js";

const rel = (seconds: bigint): DecodedClaimPredicate => ({ type: "beforeRelativeTime", seconds });
const abs = (epochSeconds: bigint): DecodedClaimPredicate => ({
  type: "beforeAbsoluteTime",
  epochSeconds,
});
const not = (predicate: DecodedClaimPredicate): DecodedClaimPredicate => ({
  type: "not",
  predicate,
});
const ANY: DecodedClaimPredicate = { type: "unconditional" };

describe("describeClaimant", () => {
  it("renders the captured claimants readably", () => {
    const { decoded } = decodeTransactionEnvelope(
      fixture("createClaimableBalance").envelopeXdr,
      "testnet",
    );
    const op = decoded.operations[0];
    if (op?.kind !== "createClaimableBalance") throw new Error("expected createClaimableBalance");
    expect(op.claimants.map(describeClaimant)).toEqual([
      "GDX3XHNB6XNJBRMOWOP4ZQVKL5CFMXD4MJFXFICFVGR7J2KQXMDIANZD can claim it at any time",
      "GB2UTPVMBMQSS64UB74V3AQVQAQWNQ225NIWCIKJ3B4XNSJB5NQJFJLJ can claim it " +
        "(at least 1 hour after creation and before 2027-10-25 11:23:58 UTC) or " +
        "within 1 minute of creation",
    ]);
  });
});

describe("describePredicate", () => {
  it.each<[DecodedClaimPredicate, string]>([
    [ANY, "at any time"],
    [abs(0n), "before 1970-01-01 00:00:00 UTC"],
    [rel(90n), "within 1 minute 30 seconds of creation"],
    [not(abs(1_824_463_438n)), "at or after 2027-10-25 11:23:58 UTC"],
    [not(rel(3600n)), "at least 1 hour after creation"],
    [not(ANY), "never"],
    [not(not(ANY)), "unless never"],
    [
      not({ type: "or", predicates: [ANY, rel(1n)] }),
      "unless (at any time or within 1 second of creation)",
    ],
    [
      { type: "and", predicates: [{ type: "or", predicates: [ANY, ANY] }, rel(60n)] },
      "(at any time or at any time) and within 1 minute of creation",
    ],
  ])("%# → %s", (predicate, text) => {
    expect(describePredicate(predicate)).toBe(text);
  });
});

describe("formatDuration", () => {
  it.each<[bigint, string]>([
    [0n, "0 seconds"],
    [1n, "1 second"],
    [3600n, "1 hour"],
    [90_061n, "1 day 1 hour 1 minute 1 second"],
    [172_800n, "2 days"],
    // The largest int64: still exact, no rounding.
    [9_223_372_036_854_775_807n, "106751991167300 days 15 hours 30 minutes 7 seconds"],
  ])("%s s → %s", (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
  });
});

describe("formatEpochSeconds", () => {
  it("shows a UTC date and time", () => {
    expect(formatEpochSeconds(1_824_463_438n)).toBe("2027-10-25 11:23:58 UTC");
  });

  it("shows the raw Unix time past the range of a date", () => {
    expect(formatEpochSeconds(9_223_372_036_854_775_807n)).toBe("Unix time 9223372036854775807");
  });

  it("shows a date up to the end of year 9999, the raw Unix time after", () => {
    expect(formatEpochSeconds(253_402_300_799n)).toBe("9999-12-31 23:59:59 UTC");
    expect(formatEpochSeconds(253_402_300_800n)).toBe("Unix time 253402300800");
  });
});
