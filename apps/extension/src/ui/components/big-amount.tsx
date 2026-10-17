import { cx } from "../cx.js";

// Large XLM figures (Home total, activity detail). Amounts are never truncated (CONVENTIONS
// §6.1), so long values step down in size, and wrap anywhere as a last resort rather than
// running out of the card. Sizes fit the 360 px popup: the longest possible value
// ("922,337,203,685.4775807", int64 max) fits at the smallest step.

/** Font size class for a formatted figure, by length. */
export function bigAmountSize(text: string): string {
  if (text.length <= 14) return "text-[28px]";
  if (text.length <= 18) return "text-[22px]";
  return "text-[18px]";
}

export function BigAmount({
  value,
  testId,
  className,
}: {
  /** Formatted figure, e.g. "10,016.75" or "+2.25". */
  value: string;
  testId?: string;
  className?: string;
}) {
  return (
    <p
      className={cx(
        "tabular mt-0.5 font-semibold leading-tight tracking-[-0.02em] [overflow-wrap:anywhere]",
        bigAmountSize(value),
        className,
      )}
      data-testid={testId}
    >
      {value} <span className="text-[15px] font-medium text-muted">XLM</span>
    </p>
  );
}
