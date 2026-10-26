import { CHECK_NAMES, FINDINGS_UI_TEXT, type Finding } from "@stellix/core";
import type * as Core from "@stellix/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FindingList } from "../finding-list.js";

// Every S1 rule has copy, but a rule can still land before its text does (S3 adds rule IDs).
// This file removes HIGH_FEE's copy so the fallback stays covered.
vi.mock("@stellix/core", async (importOriginal) => {
  const core = await importOriginal<typeof Core>();
  const copy = Object.fromEntries(
    Object.entries(core.RULE_COPY).filter(([ruleId]) => ruleId !== "HIGH_FEE"),
  );
  return { ...core, RULE_COPY: copy };
});

const finding: Finding = {
  ruleId: "HIGH_FEE",
  severity: "medium",
  confidence: "high",
  evidence: { maxFee: "0.2" },
};

describe("a finding whose rule has no copy yet", () => {
  it("is titled by its check name, with the missing-copy body", () => {
    const html = renderToStaticMarkup(<FindingList findings={[finding]} />);
    expect(html).toContain(CHECK_NAMES.HIGH_FEE);
    expect(html).toContain(FINDINGS_UI_TEXT.missingCopyBody);
  });
});
