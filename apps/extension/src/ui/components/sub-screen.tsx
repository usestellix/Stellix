import type { NetworkId } from "@stellix/core";
import type { ReactNode } from "react";
import { IconButton } from "./button.js";
import { ArrowLeftIcon, ChevronRightIcon } from "./icons.js";
import { PopupHeader } from "./popup-header.js";

/** Secondary popup screen: back + title on the left, network badge always visible (§6.14). */
export function SubScreen({
  title,
  network,
  onBack,
  children,
  testId,
  footer,
}: {
  title: string;
  network: NetworkId;
  onBack: () => void;
  children: ReactNode;
  testId: string;
  /** Pinned below the scrolling content (primary actions must never be below the fold). */
  footer?: ReactNode;
}) {
  return (
    <div data-testid="popup" data-screen={testId} className="flex h-full flex-col bg-surface">
      <PopupHeader
        network={network}
        leading={
          <div className="flex min-w-0 items-center gap-1">
            <IconButton label="Back" onClick={onBack} className="-ml-2">
              <ArrowLeftIcon size={16} />
            </IconButton>
            <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em]">{title}</h1>
          </div>
        }
      />
      <main className="flex-1 overflow-y-auto px-4 pb-6 pt-4">{children}</main>
      {footer !== undefined && (
        <footer className="shrink-0 px-4 pb-4 pt-3 shadow-[0_-1px_0_var(--color-line)]">
          {footer}
        </footer>
      )}
    </div>
  );
}

/** A tappable settings/list row. */
export function ListRow({
  label,
  detail,
  onClick,
  tone = "default",
  trailing,
}: {
  label: string;
  detail?: string | undefined;
  onClick: () => void;
  tone?: "default" | "danger";
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="pressable flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover-fine:bg-fill"
    >
      <span
        className={
          tone === "danger" ? "flex-1 text-[14px] text-danger" : "flex-1 text-[14px] text-ink"
        }
      >
        {label}
      </span>
      {detail !== undefined && <span className="shrink-0 text-[13px] text-muted">{detail}</span>}
      {trailing ?? <ChevronRightIcon size={14} className="shrink-0 text-faint" />}
    </button>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="px-3 pb-1 pt-4 text-[11px] font-medium uppercase tracking-[0.08em] text-muted first:pt-0">
      {children}
    </h2>
  );
}
