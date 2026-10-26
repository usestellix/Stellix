import {
  CHECK_NAMES,
  FINDINGS_UI_TEXT,
  RULE_IDS,
  SEVERITIES,
  SEVERITY_LABELS,
  UNAVAILABLE_REASONS,
  UNAVAILABLE_REASON_TEXT,
  type CheckUnavailable,
  type Finding,
  type Severity,
} from "@stellix/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FindingList } from "../finding-list.js";
import { sortFindings, unavailableRows } from "../model.js";
import { SeverityBadge } from "../severity-badge.js";
import { UnavailableChecks } from "../unavailable-checks.js";

function f(
  severity: Severity,
  opIndex?: number,
  ruleId: Finding["ruleId"] = "UNSUPPORTED_OP",
): Finding {
  return {
    ruleId,
    severity,
    confidence: "high",
    ...(opIndex === undefined ? {} : { opIndex }),
    evidence: { opNumber: String((opIndex ?? 0) + 1), opType: "invokeHostFunction" },
  };
}

/** How renderToStaticMarkup escapes text. */
const escaped = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("'", "&#x27;").replaceAll('"', "&quot;");

const severities = (list: readonly Finding[]) => list.map((x) => x.severity);

describe("sortFindings", () => {
  it("orders highest severity first, whatever the input order", () => {
    const input = [f("low"), f("critical"), f("info"), f("high"), f("medium")];
    expect(severities(sortFindings(input))).toEqual(["critical", "high", "medium", "low", "info"]);
  });

  it("within a severity: by operation, whole-transaction findings last, then report order", () => {
    const a = f("high", 2);
    const b = f("high");
    const c = f("high", 0);
    const d = f("high", 2, "MEMO_REQUIRED");
    expect(sortFindings([a, b, c, d])).toEqual([c, a, d, b]);
  });

  it("never drops or invents findings, and doesn't mutate its input", () => {
    const input = [f("info"), f("critical")];
    const copy = [...input];
    expect(sortFindings(input)).toHaveLength(2);
    expect(input).toEqual(copy);
  });

  it("renders in that order", () => {
    const html = renderToStaticMarkup(
      <FindingList findings={[f("low", 0), f("critical", 1), f("medium", 2)]} />,
    );
    const order = [...html.matchAll(/data-severity="(\w+)"/g)].map((m) => m[1]);
    expect(order).toEqual(["critical", "medium", "low"]);
  });

  it("no findings: says only that the checks that ran flagged nothing", () => {
    const html = renderToStaticMarkup(<FindingList findings={[]} />);
    expect(html).toContain(escaped(FINDINGS_UI_TEXT.noFindings));
    expect(html).not.toMatch(/safe/i);
  });

  it("evidence values are escaped data, never markup", () => {
    const evil: Finding = {
      ...f("high", 0),
      evidence: { opNumber: "1", opType: '<img src=x onerror="alert(1)">' },
    };
    const html = renderToStaticMarkup(<FindingList findings={[evil]} />);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("SeverityBadge", () => {
  it.each(SEVERITIES)("%s: text label plus an icon (never colour alone)", (severity) => {
    const html = renderToStaticMarkup(<SeverityBadge severity={severity} />);
    expect(html).toContain(SEVERITY_LABELS[severity]);
    expect(html).toContain("<svg");
  });

  it("each severity has its own icon", () => {
    const icons = SEVERITIES.map((s) =>
      renderToStaticMarkup(<SeverityBadge severity={s} />).replace(/^.*?(<svg.*<\/svg>).*$/s, "$1"),
    );
    expect(new Set(icons).size).toBe(SEVERITIES.length);
  });
});

describe("Checks that couldn't run", () => {
  const checks: CheckUnavailable[] = [
    { ruleId: "TRUST_UNVERIFIED", reason: "timeout" },
    { ruleId: "OFFER_BAD_PRICE", reason: "unreachable" },
    { ruleId: "TRUST_UNVERIFIED", reason: "timeout" },
  ];

  it("lists each check once, with its name and reason", () => {
    expect(unavailableRows(checks)).toEqual([
      {
        ruleId: "TRUST_UNVERIFIED",
        name: CHECK_NAMES.TRUST_UNVERIFIED,
        reason: UNAVAILABLE_REASON_TEXT.timeout,
      },
      {
        ruleId: "OFFER_BAD_PRICE",
        name: CHECK_NAMES.OFFER_BAD_PRICE,
        reason: UNAVAILABLE_REASON_TEXT.unreachable,
      },
    ]);
  });

  it("names every rule and reason", () => {
    for (const ruleId of RULE_IDS) {
      for (const reason of UNAVAILABLE_REASONS) {
        const [row] = unavailableRows([{ ruleId, reason }]);
        expect(row?.name).toBe(CHECK_NAMES[ruleId]);
        expect(row?.reason).toBe(UNAVAILABLE_REASON_TEXT[reason]);
      }
    }
  });

  it("renders the heading, note and every check, never as passed", () => {
    const html = renderToStaticMarkup(<UnavailableChecks checks={checks} />);
    expect(html).toContain(escaped(FINDINGS_UI_TEXT.unavailableHeading));
    expect(html).toContain(escaped(FINDINGS_UI_TEXT.unavailableNote));
    expect([...html.matchAll(/data-unavailable="(\w+)"/g)].map((m) => m[1])).toEqual([
      "TRUST_UNVERIFIED",
      "OFFER_BAD_PRICE",
    ]);
    // CheckIcon's path: a check mark must never appear next to a check that didn't run.
    expect(html).not.toContain("m4.5 10.5 3.5 3.5 7.5-8");
    expect(html).not.toMatch(/\b(passed|safe|ok)\b/i);
    expect(html).not.toContain("success");
  });

  it("renders nothing when every check ran", () => {
    expect(renderToStaticMarkup(<UnavailableChecks checks={[]} />)).toBe("");
  });

  it("is independent of findings: no findings plus unavailable checks still shows them", () => {
    const html = renderToStaticMarkup(
      <>
        <FindingList findings={[]} />
        <UnavailableChecks checks={[{ ruleId: "PATH_LOW_MIN", reason: "not_found" }]} />
      </>,
    );
    expect(html).toContain(escaped(FINDINGS_UI_TEXT.noFindings));
    expect(html).toContain(escaped(CHECK_NAMES.PATH_LOW_MIN));
  });
});
