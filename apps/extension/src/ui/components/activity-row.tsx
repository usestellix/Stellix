import type { HistoryItem } from "@stellix/core";
import { cx } from "../cx.js";
import { activityTitle, memoLabel, signedAmount } from "../lib/activity-copy.js";
import { relativeTime } from "../lib/time.js";
import { AccountIcon, ArrowInIcon, ArrowOutIcon } from "./icons.js";

/** One activity row (UI_FLOWS §7): direction icon, title, memo line, signed amount, time. */
export function ActivityRow({
  item,
  now,
  onOpen,
}: {
  item: HistoryItem;
  now: number;
  onOpen: (item: HistoryItem) => void;
}) {
  const amount = signedAmount(item);
  const Icon =
    item.kind !== "payment" ? AccountIcon : item.direction === "in" ? ArrowInIcon : ArrowOutIcon;
  return (
    <li>
      <button
        type="button"
        onClick={() => {
          onOpen(item);
        }}
        data-testid="activity-row"
        data-id={item.id}
        className="pressable flex min-h-14 w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover-fine:bg-fill"
      >
        <span
          className={cx(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            item.direction === "in"
              ? "bg-success/10 text-success"
              : "bg-fill-strong text-ink-secondary",
          )}
        >
          <Icon size={15} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-ink">
            {activityTitle(item)}
          </span>
          {item.memo !== undefined && (
            <span className="block truncate text-[12px] text-muted" data-testid="activity-memo">
              {memoLabel(item.memo)}
            </span>
          )}
        </span>
        <span className="shrink-0 text-right">
          <span
            className={cx(
              "tabular block text-[13px] font-medium",
              item.direction === "in" ? "text-success" : "text-ink",
            )}
            data-testid="activity-amount"
          >
            {amount === null ? "—" : `${amount} XLM`}
          </span>
          <span className="block text-[11px] text-faint">{relativeTime(item.at, now)}</span>
        </span>
      </button>
    </li>
  );
}

export function ActivitySkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <ul aria-busy="true" aria-label="Loading activity" className="space-y-1">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex min-h-14 items-center gap-3 px-2">
          <span className="size-8 rounded-full bg-fill-strong" />
          <span className="flex-1 space-y-1.5">
            <span className="block h-3 w-40 rounded bg-fill-strong" />
            <span className="block h-2.5 w-20 rounded bg-fill" />
          </span>
          <span className="h-3 w-14 rounded bg-fill-strong" />
        </li>
      ))}
    </ul>
  );
}
