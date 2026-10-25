import { FINDINGS_UI_TEXT, type CheckUnavailable } from "@stellix/core";
import { NotCheckedIcon } from "../icons.js";
import { unavailableRows } from "./model.js";

// "Checks that couldn't run" (invariant 18): always shown when any check didn't run, with a
// "not checked" icon and the reason. Never a check mark, never worded as passed.

export function UnavailableChecks({ checks }: { checks: readonly CheckUnavailable[] }) {
  const rows = unavailableRows(checks);
  if (rows.length === 0) return null;
  return (
    <section
      aria-labelledby="unavailable-heading"
      className="rounded-lg bg-warning-fill px-3.5 py-3"
    >
      <h2
        id="unavailable-heading"
        className="text-[11px] font-semibold uppercase tracking-[0.08em] text-warning"
      >
        {FINDINGS_UI_TEXT.unavailableHeading}
      </h2>
      <p className="mt-1 max-w-[60ch] text-[13px] leading-5 text-ink-secondary">
        {FINDINGS_UI_TEXT.unavailableNote}
      </p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {rows.map((row) => (
          <li key={row.ruleId} data-unavailable={row.ruleId} className="flex gap-2 text-[13px]">
            <NotCheckedIcon size={15} className="mt-0.5 shrink-0 text-warning" />
            <span>
              <span className="font-medium text-ink">{row.name}</span>
              <span className="text-ink-secondary"> · {row.reason}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
