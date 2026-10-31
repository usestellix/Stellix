import { FINDINGS_UI_TEXT, type ReportView } from "@stellix/core";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { errorCopy } from "../../../errorCopy.js";
import { AnalyzeReport } from "../analyze-report.js";
import { analyzeErrorText, memoText, type AnalyzeView } from "../model.js";

// The Analyze screen (Mode C, #35): what it shows for each decision, whose perspective it uses,
// and that it can't ask for a signature.

const G = "GDX3XHNB6XNJBRMOWOP4ZQVKL5CFMXD4MJFXFICFVGR7J2KQXMDIANZD";
const OTHER = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";

const escaped = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("'", "&#x27;").replaceAll('"', "&quot;");

function view(
  decision: ReportView["decision"],
  extra: { findings?: ReportView["findings"]; spendsFromAccount?: boolean } = {},
): AnalyzeView {
  return {
    account: G,
    spendsFromAccount: extra.spendsFromAccount ?? true,
    transaction: {
      envelopeType: "tx",
      source: G,
      feeStroops: "100",
      feeBump: null,
      memo: { type: "text", text: "Stellix verified this", hex: "00" },
      operations: [
        [
          {
            template: "Sends {amount} to {destination}.",
            values: { amount: "1 XLM", destination: OTHER },
          },
        ],
      ],
    },
    report: {
      digest: "0".repeat(64),
      network: "testnet",
      ruleSetVersion: "1",
      findings: extra.findings ?? [],
      checksUnavailable: [],
      decision,
      createdAt: 0,
      expiresAt: 1,
    },
  };
}

const signerFinding: ReportView["findings"][number] = {
  ruleId: "ACCT_SIGNER_CHANGE",
  severity: "critical",
  confidence: "high",
  opIndex: 0,
  evidence: { opNumber: "1", signerKey: OTHER, weight: "1", account: G },
};

describe("AnalyzeReport", () => {
  it("blocked: shows 'Stellix would block this' and the finding", () => {
    const html = renderToStaticMarkup(
      <AnalyzeReport
        result={view(
          { state: "blocked", ruleIds: ["ACCT_SIGNER_CHANGE"], overridable: false },
          { findings: [signerFinding] },
        )}
      />,
    );
    expect(html).toContain('data-testid="would-block"');
    expect(html).toContain(FINDINGS_UI_TEXT.wouldBlockTitle);
    expect(html).toContain('data-rule="ACCT_SIGNER_CHANGE"');
  });

  it.each([
    [{ state: "ready" } as const],
    [{ state: "review", requires: "click" } as const],
    [{ state: "review", requires: "typed", typedPhrase: "CONFIRM" } as const],
  ])("%j: no block banner, no typed input, no confirm", (decision) => {
    const html = renderToStaticMarkup(<AnalyzeReport result={view(decision)} />);
    expect(html).not.toContain("would-block");
    expect(html).not.toContain("typed-confirmation");
    expect(html).not.toMatch(/<button/);
  });

  it("names the account it analyzed for", () => {
    const html = renderToStaticMarkup(<AnalyzeReport result={view({ state: "ready" })} />);
    expect(html).toContain("Analyzed for account GDX3…ANZD");
  });

  it("a transaction that doesn't spend from the account says findings are relative to it", () => {
    const html = renderToStaticMarkup(
      <AnalyzeReport result={view({ state: "ready" }, { spendsFromAccount: false })} />,
    );
    expect(html).toContain('data-testid="not-spending"');
    expect(html).toContain(escaped(FINDINGS_UI_TEXT.notSpending));
    const spends = renderToStaticMarkup(<AnalyzeReport result={view({ state: "ready" })} />);
    expect(spends).not.toContain("not-spending");
  });

  it("memo text is quoted as the transaction's words", () => {
    const html = renderToStaticMarkup(<AnalyzeReport result={view({ state: "ready" })} />);
    expect(html).toContain("“Stellix verified this”");
  });

  it("never says safe, in any decision", () => {
    for (const decision of [
      { state: "ready" },
      { state: "review", requires: "click" },
      { state: "blocked", ruleIds: ["ACCT_SIGNER_CHANGE"], overridable: false },
    ] as const) {
      const html = renderToStaticMarkup(
        <AnalyzeReport result={view(decision, { spendsFromAccount: false })} />,
      );
      expect(html).not.toMatch(/\bsafe\b/i);
    }
  });
});

describe("analyzeErrorText", () => {
  it("a link for an offered network names it and says to choose it", () => {
    expect(
      analyzeErrorText("SHIELD_INPUT_INVALID", { linkNetwork: "mainnet" }, ["testnet", "mainnet"]),
    ).toBe("This link is for Mainnet. Choose Mainnet above to analyze it.");
  });

  it("a link for a network this build doesn't offer says so", () => {
    expect(analyzeErrorText("SHIELD_INPUT_INVALID", { linkNetwork: "mainnet" }, ["testnet"])).toBe(
      "This link is for Mainnet, which this version of Stellix doesn't offer.",
    );
  });

  it("everything else uses errorCopy", () => {
    expect(analyzeErrorText("SHIELD_INPUT_TOO_LARGE", undefined, ["testnet"])).toBe(
      errorCopy("SHIELD_INPUT_TOO_LARGE"),
    );
    expect(analyzeErrorText("SHIELD_INPUT_INVALID", { linkNetwork: "x" }, ["testnet"])).toBe(
      errorCopy("SHIELD_INPUT_INVALID"),
    );
  });
});

describe("memoText", () => {
  it("shows invalid UTF-8 as hex, never as text", () => {
    expect(memoText({ type: "text", text: null, hex: "ff" })).toBe("Text (not UTF-8), hex ff");
    expect(memoText({ type: "none" })).toBeNull();
  });
});

describe("the Analyze screen can't ask for a signature", () => {
  it("its only request is SHIELD_ANALYZE", () => {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const source = readdirSync(dir)
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => readFileSync(path.join(dir, f), "utf8"))
      .join("\n");
    const requests = [...source.matchAll(/request\(\s*"([A-Z_]+)"/g)].map((m) => m[1]);
    expect(requests).toEqual(["SHIELD_ANALYZE"]);
    expect(source).not.toMatch(/sendMessage|browser\.runtime/);
  });
});
