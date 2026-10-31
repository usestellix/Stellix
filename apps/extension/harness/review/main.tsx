import type { Confirmation, Finding, PaymentSummary, ReportView } from "@stellix/core";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import "./harness.css";
import { ReviewScreen } from "../../src/ui/screens/send/review-screen.js";

// Test harness for the Send Review screen with Shield findings (#36). Built only by
// `pnpm test:harness`, into .output-harness/; never part of the extension build (it lives
// outside src/, so WXT doesn't see it).
//
// A Stellix-built payment can't produce a finding on Review today: the destination is the one
// the user entered, the fee is capped below HIGH_FEE, timebounds are 180 s, and MEMO_REQUIRED
// blocks at prepare. Review's findings are defense in depth for future flows (swaps,
// trustlines), so the crafted reports below are rendered here instead of through the SW.
//
// ?decision=ready|click|typed|blocked picks the report; ?phrase= sets the typed phrase. What
// Confirm would send is written to [data-testid=sent-confirmation].

const params = new URLSearchParams(location.search);
const decisionParam = params.get("decision") ?? "ready";
const phrase = params.get("phrase") ?? "CONFIRM";

const G = "GDX3XHNB6XNJBRMOWOP4ZQVKL5CFMXD4MJFXFICFVGR7J2KQXMDIANZD";
const OTHER = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
const now = Date.now();

const summary: PaymentSummary = {
  kind: "payment",
  source: G,
  destination: OTHER,
  destinationBase: OTHER,
  amountStroops: "20000000",
  feeStroops: "100",
  totalStroops: "20000100",
  memo: { type: "none" },
  network: "testnet",
  expiresAt: now + 180_000,
  firstTimeDestination: false,
  feeEstimated: false,
};

const FINDINGS: Record<string, Finding[]> = {
  ready: [],
  click: [
    {
      ruleId: "HIGH_FEE",
      severity: "medium",
      confidence: "high",
      evidence: { feePayer: G, maxFee: "0.2", threshold: "0.1" },
    },
  ],
  typed: [
    {
      ruleId: "UNNAMED_OUTFLOW",
      severity: "high",
      confidence: "high",
      opIndex: 0,
      evidence: { opNumber: "1", opType: "payment", amount: "2 XLM", destination: OTHER },
    },
  ],
  blocked: [
    {
      ruleId: "ACCT_SIGNER_CHANGE",
      severity: "critical",
      confidence: "high",
      opIndex: 0,
      evidence: { opNumber: "1", signerKey: OTHER, weight: "1", account: G },
    },
  ],
};

const DECISIONS: Record<string, ReportView["decision"]> = {
  ready: { state: "ready" },
  click: { state: "review", requires: "click" },
  typed: { state: "review", requires: "typed", typedPhrase: phrase },
  blocked: { state: "blocked", ruleIds: ["ACCT_SIGNER_CHANGE"], overridable: false },
};

const report: ReportView = {
  digest: "0".repeat(64),
  network: "testnet",
  ruleSetVersion: "1",
  findings: FINDINGS[decisionParam] ?? [],
  checksUnavailable: [],
  decision: DECISIONS[decisionParam] ?? { state: "ready" },
  createdAt: now,
  expiresAt: now + 180_000,
};

function Harness() {
  const [sent, setSent] = useState<Confirmation | null>(null);
  return (
    <div className="h-[600px] w-[360px]">
      <ReviewScreen
        network="testnet"
        summary={summary}
        report={report}
        expiresAt={summary.expiresAt}
        rebuilt={false}
        error={null}
        busy={false}
        onCancel={() => undefined}
        onConfirm={setSent}
        onReviewAgain={() => undefined}
      />
      <output data-testid="sent-confirmation" hidden>
        {sent === null ? "" : JSON.stringify(sent)}
      </output>
    </div>
  );
}

const root = document.getElementById("root");
if (root !== null) createRoot(root).render(<Harness />);
