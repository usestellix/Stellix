import { FINDINGS_UI_TEXT, type PaymentSummary, type ReportView } from "@stellix/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewScreen } from "../review-screen.js";

// The Review screen renders Shield's report (#36). Static render: what each decision shows and
// whether Confirm is enabled on first paint. Typing is driven in the harness E2E.

const NOW = Date.now();
const G = "GDX3XHNB6XNJBRMOWOP4ZQVKL5CFMXD4MJFXFICFVGR7J2KQXMDIANZD";

const summary: PaymentSummary = {
  kind: "payment",
  source: G,
  destination: G,
  destinationBase: G,
  amountStroops: "20000000",
  feeStroops: "100",
  totalStroops: "20000100",
  memo: { type: "none" },
  network: "testnet",
  expiresAt: NOW + 180_000,
  firstTimeDestination: false,
  feeEstimated: false,
};

function report(decision: ReportView["decision"], extra: Partial<ReportView> = {}): ReportView {
  return {
    digest: "0".repeat(64),
    network: "testnet",
    ruleSetVersion: "1",
    findings: [],
    checksUnavailable: [],
    decision,
    createdAt: NOW,
    expiresAt: NOW + 180_000,
    ...extra,
  };
}

function render(r: ReportView): string {
  return renderToStaticMarkup(
    <ReviewScreen
      network="testnet"
      summary={summary}
      report={r}
      expiresAt={NOW + 180_000}
      rebuilt={false}
      error={null}
      busy={false}
      onCancel={() => undefined}
      onConfirm={() => undefined}
      onReviewAgain={() => undefined}
    />,
  );
}

/** The disabled attribute, not the `disabled:` utility classes. */
const DISABLED = /\sdisabled=""/;

/** The Confirm button's opening tag. */
function confirmButton(html: string): string {
  const end = html.indexOf("Confirm and send");
  return html.slice(html.lastIndexOf("<button", end), end);
}

describe("ReviewScreen with a report", () => {
  it("ready: findings section says nothing flagged; Confirm enabled", () => {
    const html = render(report({ state: "ready" }));
    expect(html).toContain('data-decision="ready"');
    expect(html).toContain(FINDINGS_UI_TEXT.noFindings);
    expect(confirmButton(html)).not.toMatch(DISABLED);
    expect(html).not.toMatch(/\bsafe\b/i);
  });

  it("review-click: shows the finding and unavailable checks; Confirm enabled", () => {
    const html = render(
      report(
        { state: "review", requires: "click" },
        {
          findings: [
            {
              ruleId: "HIGH_FEE",
              severity: "medium",
              confidence: "high",
              evidence: { feePayer: G, maxFee: "0.2", threshold: "0.1" },
            },
          ],
          checksUnavailable: [{ ruleId: "TRUST_UNVERIFIED", reason: "timeout" }],
        },
      ),
    );
    expect(html).toContain('data-rule="HIGH_FEE"');
    expect(html).toContain('data-unavailable="TRUST_UNVERIFIED"');
    expect(confirmButton(html)).not.toMatch(DISABLED);
  });

  it("review-typed: shows the decision's phrase (not a constant); Confirm disabled", () => {
    const html = render(
      report(
        { state: "review", requires: "typed", typedPhrase: "SEND ANYWAY" },
        {
          findings: [
            {
              ruleId: "UNNAMED_OUTFLOW",
              severity: "high",
              confidence: "high",
              opIndex: 0,
              evidence: { opNumber: "1", opType: "payment", amount: "2 XLM", destination: G },
            },
          ],
        },
      ),
    );
    expect(html).toContain('data-testid="typed-phrase">SEND ANYWAY</span>');
    expect(confirmButton(html)).toMatch(DISABLED);
  });

  it("blocked: no typed input, a notice, Confirm disabled", () => {
    const html = render(
      report(
        { state: "blocked", ruleIds: ["ACCT_SIGNER_CHANGE"], overridable: false },
        {
          findings: [
            {
              ruleId: "ACCT_SIGNER_CHANGE",
              severity: "critical",
              confidence: "high",
              opIndex: 0,
              evidence: { opNumber: "1", signerKey: G, weight: "1", account: G },
            },
          ],
        },
      ),
    );
    expect(html).toContain(FINDINGS_UI_TEXT.blockedSign.replaceAll("'", "&#x27;"));
    expect(html).not.toContain("typed-confirmation");
    expect(confirmButton(html)).toMatch(DISABLED);
  });
});
