import type { ReactNode } from "react";
import { cx } from "../../cx.js";
import { ArrowLeftIcon } from "../../components/icons.js";
import { Wordmark } from "../../components/wordmark.js";

/**
 * Onboarding page frame. Wayfinding on every step (where am I, how do I get out): wordmark,
 * "Step n of m", and a Back control. `stepKey` remounts the content so each step gets the
 * gentle `.enter` transition; onboarding is rare and first-time, so a little motion is allowed.
 */
export function OnboardingShell({
  stepKey,
  progress,
  onBack,
  children,
}: {
  stepKey: string;
  progress?: { step: number; of: number } | undefined;
  onBack?: (() => void) | undefined;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas">
      {/* Same 440px column as the content, so the wordmark and every step share one left edge. */}
      <header className="mx-auto flex h-16 max-w-[488px] items-center justify-between px-6">
        <Wordmark />
        {progress !== undefined && (
          <div
            className="flex items-center gap-3"
            aria-label={`Step ${String(progress.step)} of ${String(progress.of)}`}
          >
            <div className="flex gap-1" aria-hidden="true">
              {Array.from({ length: progress.of }, (_, i) => (
                <span
                  key={i}
                  className={cx(
                    "h-1 w-6 rounded-full transition-colors duration-200",
                    i < progress.step ? "bg-ink" : "bg-fill-strong",
                  )}
                />
              ))}
            </div>
            <span className="tabular text-[12px] text-muted">
              Step {progress.step} of {progress.of}
            </span>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-[488px] px-6 pb-16 pt-8 sm:pt-14">
        <div key={stepKey} className="enter">
          {onBack !== undefined && (
            <button
              type="button"
              onClick={onBack}
              className="pressable -ml-2 mb-6 inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[13px] text-muted hover-fine:bg-fill hover-fine:text-ink"
            >
              <ArrowLeftIcon size={15} />
              Back
            </button>
          )}
          {children}
        </div>
      </main>
    </div>
  );
}

export function StepHeading({ title, body }: { title: string; body?: string }) {
  return (
    <div className="mb-7 space-y-2">
      <h1 className="text-[26px] font-semibold leading-[1.15] tracking-[-0.022em] text-ink">
        {title}
      </h1>
      {body !== undefined && (
        <p className="max-w-[52ch] text-[15px] leading-[1.55] text-muted">{body}</p>
      )}
    </div>
  );
}
