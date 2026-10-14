import type { ReactNode } from "react";
import { cx } from "../cx.js";
import { AlertIcon, InfoIcon, ShieldIcon } from "./icons.js";

/** neutral → info icon; security → shield (password/keys notes); warning → alert. */
type Tone = "warning" | "neutral" | "security";

/** Inline notice. Tinted fill, no border; the icon carries the meaning alongside the text. */
export function Callout({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div
      role="note"
      className={cx(
        "flex gap-2.5 rounded-lg px-3.5 py-3 text-[13px] leading-5",
        tone === "warning" ? "bg-warning-fill text-warning" : "bg-fill text-ink-secondary",
      )}
    >
      {tone === "warning" ? (
        <AlertIcon className="mt-0.5 shrink-0" size={15} />
      ) : tone === "security" ? (
        <ShieldIcon className="mt-0.5 shrink-0" size={15} />
      ) : (
        <InfoIcon className="mt-0.5 shrink-0" size={15} />
      )}
      <div className="max-w-[60ch]">{children}</div>
    </div>
  );
}
