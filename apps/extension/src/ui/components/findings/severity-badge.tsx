import { SEVERITY_LABELS, type Severity } from "@stellix/core";
import type { ComponentType } from "react";
import { cx } from "../../cx.js";
import {
  AlertIcon,
  CircleDashIcon,
  InfoIcon,
  OctagonAlertIcon,
  TriangleAlertIcon,
} from "../icons.js";

// Text plus a distinct icon per severity; colour only reinforces them (CONVENTIONS §6.1), so
// critical and high read apart even though both use the danger tint.

const STYLE: Record<Severity, { icon: ComponentType<{ size?: number }>; tone: string }> = {
  critical: {
    icon: OctagonAlertIcon,
    tone: "bg-danger-fill text-danger shadow-[inset_0_0_0_1px_currentColor]",
  },
  high: { icon: TriangleAlertIcon, tone: "bg-danger-fill text-danger" },
  medium: { icon: AlertIcon, tone: "bg-warning-fill text-warning" },
  low: { icon: CircleDashIcon, tone: "bg-fill text-ink-secondary" },
  info: { icon: InfoIcon, tone: "bg-fill text-muted" },
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const { icon: Icon, tone } = STYLE[severity];
  return (
    <span
      data-severity={severity}
      className={cx(
        "inline-flex h-6 shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2",
        "text-[11px] font-semibold uppercase tracking-[0.06em]",
        tone,
      )}
    >
      <Icon size={13} />
      {SEVERITY_LABELS[severity]}
    </span>
  );
}
