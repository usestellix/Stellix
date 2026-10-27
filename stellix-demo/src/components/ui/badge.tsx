import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "danger" | "warning" | "success";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-fill-strong text-ink-2",
  danger: "bg-danger-fill text-danger",
  warning: "bg-warning-fill text-warning",
  success: "bg-fill-strong text-success",
};

export function Badge({ tone = "neutral", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded-badge px-2 font-mono text-label font-medium whitespace-nowrap ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}
