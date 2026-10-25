import { FINDINGS_UI_TEXT, type Finding } from "@stellix/core";
import { EvidenceView } from "./evidence-view.js";
import { findingText, operationLabel, sortFindings } from "./model.js";
import { SeverityBadge } from "./severity-badge.js";

/** Findings, highest severity first. Says nothing about checks that didn't run. */
export function FindingList({ findings }: { findings: readonly Finding[] }) {
  const sorted = sortFindings(findings);
  return (
    <section aria-labelledby="findings-heading">
      <h2
        id="findings-heading"
        className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted"
      >
        {FINDINGS_UI_TEXT.findingsHeading}
      </h2>
      {sorted.length === 0 ? (
        <p className="mt-2 text-[13px] text-ink-secondary">{FINDINGS_UI_TEXT.noFindings}</p>
      ) : (
        <ol className="mt-2 flex flex-col gap-2">
          {sorted.map((finding, i) => {
            const { title, body } = findingText(finding);
            return (
              <li
                key={`${finding.ruleId}-${String(finding.opIndex ?? "tx")}-${String(i)}`}
                data-rule={finding.ruleId}
                className="rounded-lg bg-surface px-3.5 py-3 shadow-ring"
              >
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={finding.severity} />
                  {finding.opIndex !== undefined && (
                    <span className="text-[12px] text-muted">
                      {operationLabel(finding.opIndex)}
                    </span>
                  )}
                </div>
                <h3 className="mt-2 text-[14px] font-semibold tracking-[-0.01em] text-ink">
                  {title}
                </h3>
                <p className="mt-1 max-w-[60ch] text-[13px] leading-5 [overflow-wrap:anywhere] text-ink-secondary">
                  {body}
                </p>
                <EvidenceView evidence={finding.evidence} />
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
