import {
  CHECK_NAMES,
  FINDINGS_UI_TEXT,
  RULE_COPY,
  UNAVAILABLE_REASON_TEXT,
  compareSeverity,
  fillTemplate,
  findingCopy,
  type CheckUnavailable,
  type Confirmation,
  type Finding,
  type PolicyDecision,
  type RuleCopy,
  type RuleId,
} from "@stellix/core";

// Pure helpers behind the findings components, so ordering and wording are unit-tested without
// a DOM. All text comes from core's Shield copy table (copy/index.ts, copy/ui.ts).

/**
 * Highest severity first (SHIELD §6: highest wins, never averaged). Within a severity: by
 * operation (findings about the whole transaction last), then in the order the rules reported.
 */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return findings
    .map((finding, index) => ({ finding, index }))
    .sort((a, b) => {
      const bySeverity = compareSeverity(b.finding.severity, a.finding.severity);
      if (bySeverity !== 0) return bySeverity;
      const opA = a.finding.opIndex ?? Number.POSITIVE_INFINITY;
      const opB = b.finding.opIndex ?? Number.POSITIVE_INFINITY;
      if (opA !== opB) return opA - opB;
      return a.index - b.index;
    })
    .map((x) => x.finding);
}

/** Title and body of a finding; a rule without copy yet is named by its check. */
export function findingText(finding: Finding): RuleCopy {
  if (RULE_COPY[finding.ruleId] !== undefined) return findingCopy(finding);
  return { title: CHECK_NAMES[finding.ruleId], body: FINDINGS_UI_TEXT.missingCopyBody };
}

export function operationLabel(opIndex: number): string {
  return fillTemplate(FINDINGS_UI_TEXT.operation, { opNumber: String(opIndex + 1) });
}

export interface UnavailableRow {
  ruleId: RuleId;
  name: string;
  reason: string;
}

/** One row per check that couldn't run, in rule order as reported; duplicates collapsed. */
export function unavailableRows(checks: readonly CheckUnavailable[]): UnavailableRow[] {
  const seen = new Set<RuleId>();
  const rows: UnavailableRow[] = [];
  for (const c of checks) {
    if (seen.has(c.ruleId)) continue;
    seen.add(c.ruleId);
    rows.push({
      ruleId: c.ruleId,
      name: CHECK_NAMES[c.ruleId],
      reason: UNAVAILABLE_REASON_TEXT[c.reason],
    });
  }
  return rows;
}

/**
 * What the Review screen sends with CONFIRM for this decision and what the user typed, or null
 * while Confirm must stay disabled. Display only: the SW re-evaluates its own stored report and
 * checks this against it (invariant 15). A typed review matches the decision's own phrase.
 */
export function reviewConfirmation(decision: PolicyDecision, typed: string): Confirmation | null {
  switch (decision.state) {
    case "ready":
      return { kind: "click" };
    case "blocked":
      return null;
    case "review":
      if (decision.requires === "click") return { kind: "click" };
      return decision.typedPhrase !== undefined && typed === decision.typedPhrase
        ? { kind: "typed", phrase: typed }
        : null;
  }
}
