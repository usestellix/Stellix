import { describe, expect, it } from "vitest";
import { relativeTime } from "../time.js";

const NOW = Date.parse("2026-10-14T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("relativeTime", () => {
  it.each([
    [10_000, "just now"],
    [5 * 60_000, "5 min. ago"],
    [3 * 3_600_000, "3 hr. ago"],
    [26 * 3_600_000, "yesterday"],
    [4 * 86_400_000, "4 days ago"],
  ])("%d ms ago → %s", (ms, text) => {
    expect(relativeTime(ago(ms), NOW)).toBe(text);
  });

  it("older than a week → a short date, with the year only when it differs", () => {
    expect(relativeTime("2026-10-03T12:00:00Z", NOW)).toBe("Oct 3");
    expect(relativeTime("2025-10-03T12:00:00Z", NOW)).toBe("Oct 3, 2025");
  });

  it("unparseable → empty", () => {
    expect(relativeTime("nope", NOW)).toBe("");
  });
});
