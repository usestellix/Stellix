import { EVIDENCE_LABELS, FINDINGS_UI_TEXT } from "@stellix/core";
import { ChevronRightIcon } from "../icons.js";

// A finding's evidence. Values may come from the request (addresses, codes, a home domain), so
// they're shown as data in mono under a note saying so, never as Stellix's own words
// (invariant 17). React escapes them; nothing here interprets them.

export function EvidenceView({ evidence }: { evidence: Readonly<Record<string, string>> }) {
  const entries = Object.entries(evidence);
  if (entries.length === 0) return null;
  return (
    <details className="group mt-2 text-[12px]">
      <summary className="pressable inline-flex cursor-pointer list-none items-center gap-1 text-muted hover-fine:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon size={13} className="group-open:rotate-90" />
        {FINDINGS_UI_TEXT.evidenceSummary}
      </summary>
      <p className="mt-1.5 text-muted">{FINDINGS_UI_TEXT.evidenceNote}</p>
      <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {entries.map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="text-muted">{EVIDENCE_LABELS[key] ?? key}</dt>
            <dd className="min-w-0 break-all font-mono text-ink-secondary">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
