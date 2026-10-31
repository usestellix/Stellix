import { FINDINGS_UI_TEXT, type PolicyDecision } from "@stellix/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { reviewConfirmation } from "../model.js";
import { TypedConfirmation } from "../typed-confirmation.js";

// What the Review screen may send with CONFIRM (#36). The SW is the gate (invariant 15); these
// prove the button never offers more than the decision allows.

const typed = (phrase: string): PolicyDecision => ({
  state: "review",
  requires: "typed",
  typedPhrase: phrase,
});

describe("reviewConfirmation", () => {
  it("ready and review-click send a click", () => {
    expect(reviewConfirmation({ state: "ready" }, "")).toEqual({ kind: "click" });
    expect(reviewConfirmation({ state: "review", requires: "click" }, "")).toEqual({
      kind: "click",
    });
  });

  it("a block never yields a confirmation, whatever was typed", () => {
    const blocked: PolicyDecision = {
      state: "blocked",
      ruleIds: ["ACCT_SIGNER_CHANGE"],
      overridable: false,
    };
    for (const value of ["", "CONFIRM", "override"]) {
      expect(reviewConfirmation(blocked, value)).toBeNull();
    }
  });

  it("a typed review needs the decision's own phrase, exactly", () => {
    const decision = typed("REMOVE SIGNER");
    for (const value of ["", "CONFIRM", "remove signer", "REMOVE SIGNER ", " REMOVE SIGNER"]) {
      expect(reviewConfirmation(decision, value)).toBeNull();
    }
    expect(reviewConfirmation(decision, "REMOVE SIGNER")).toEqual({
      kind: "typed",
      phrase: "REMOVE SIGNER",
    });
  });

  it("a typed review without a phrase fails closed", () => {
    expect(reviewConfirmation({ state: "review", requires: "typed" }, "CONFIRM")).toBeNull();
  });
});

describe("TypedConfirmation", () => {
  it("shows the phrase it was given, not a constant", () => {
    const html = renderToStaticMarkup(
      <TypedConfirmation phrase="REMOVE SIGNER" value="" onChange={() => undefined} />,
    );
    expect(html).toContain(">REMOVE SIGNER</span>");
    expect(html).not.toContain("CONFIRM");
    const [before] = FINDINGS_UI_TEXT.typedPrompt.split("{phrase}");
    expect(html).toContain(before);
  });
});
