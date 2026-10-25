import type { CheckUnavailable, Finding, Severity } from "@stellix/core";
import { createRoot } from "react-dom/client";
import "./harness.css";
import { FindingList } from "../../src/ui/components/findings/finding-list.js";
import { UnavailableChecks } from "../../src/ui/components/findings/unavailable-checks.js";

// Screenshot harness for the findings components (#34). Built only by
// `pnpm screenshots:findings`, into .output-screenshots/; never part of the extension build
// (it lives outside src/, so WXT doesn't see it).
//
// ?severity=<s> renders one finding at that severity, plus the "Checks that couldn't run"
// section. The rules are ones whose copy exists; the severity is set for display.

const severity = (new URLSearchParams(location.search).get("severity") ?? "high") as Severity;

const finding: Finding = {
  ruleId: "UNSUPPORTED_OP",
  severity,
  confidence: "high",
  opIndex: 1,
  evidence: { opNumber: "2", opType: "invokeHostFunction" },
};
const memo: Finding = {
  ruleId: "MEMO_REQUIRED",
  severity: "info",
  confidence: "high",
  evidence: { destination: "GDX3XHNB6XNJBRMOWOP4ZQVKL5CFMXD4MJFXFICFVGR7J2KQXMDIANZD" },
};
const unavailable: CheckUnavailable[] = [
  { ruleId: "TRUST_UNVERIFIED", reason: "timeout" },
  { ruleId: "OFFER_BAD_PRICE", reason: "unreachable" },
];

function Harness() {
  return (
    <main className="flex w-[360px] flex-col gap-4 bg-surface p-4" data-testid="harness">
      <FindingList findings={severity === "info" ? [finding] : [memo, finding]} />
      <UnavailableChecks checks={unavailable} />
    </main>
  );
}

const root = document.getElementById("root");
if (root !== null) createRoot(root).render(<Harness />);
