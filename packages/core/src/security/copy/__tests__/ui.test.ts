import { describe, expect, it } from "vitest";
import { RULE_IDS, SEVERITIES, UNAVAILABLE_REASONS } from "../../types.js";
import { CHECK_NAMES, FINDINGS_UI_TEXT, SEVERITY_LABELS, UNAVAILABLE_REASON_TEXT } from "../ui.js";

describe("findings UI copy", () => {
  it("names every severity, rule and unavailable reason", () => {
    expect(Object.keys(SEVERITY_LABELS).sort()).toEqual([...SEVERITIES].sort());
    expect(Object.keys(CHECK_NAMES).sort()).toEqual([...RULE_IDS].sort());
    expect(Object.keys(UNAVAILABLE_REASON_TEXT).sort()).toEqual([...UNAVAILABLE_REASONS].sort());
  });

  it("never says safe, and never words a check that didn't run as passed", () => {
    const all = [
      ...Object.values(SEVERITY_LABELS),
      ...Object.values(CHECK_NAMES),
      ...Object.values(UNAVAILABLE_REASON_TEXT),
      ...Object.values(FINDINGS_UI_TEXT),
    ].join(" ");
    expect(all).not.toMatch(/\bsafe/i);
    expect(
      `${FINDINGS_UI_TEXT.unavailableHeading} ${FINDINGS_UI_TEXT.unavailableNote}`,
    ).not.toMatch(/\b(pass|passed|ok|clear|verified)\b/i);
    expect(Object.values(UNAVAILABLE_REASON_TEXT).join(" ")).not.toMatch(/\b(pass|passed|ok)\b/i);
  });
});
