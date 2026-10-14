import type { PasswordStrength } from "@stellix/core";
import { cx } from "../cx.js";

const LEVELS = {
  weak: { bars: 1, label: "Too short", tone: "bg-danger" },
  fair: { bars: 2, label: "Fair", tone: "bg-warning" },
  good: { bars: 3, label: "Good", tone: "bg-success" },
  strong: { bars: 4, label: "Strong", tone: "bg-success" },
} as const satisfies Record<PasswordStrength, { bars: number; label: string; tone: string }>;

/** Advisory only (KEY_MANAGEMENT §5). Color transitions only; nothing moves. */
export function StrengthMeter({ strength }: { strength: PasswordStrength | null }) {
  const level = strength === null ? null : LEVELS[strength];
  return (
    <div
      className="flex items-center gap-3"
      data-testid="strength-meter"
      data-strength={strength ?? "none"}
    >
      <div className="flex flex-1 gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={cx(
              "h-1 flex-1 rounded-full transition-colors duration-200",
              level !== null && i <= level.bars ? level.tone : "bg-fill-strong",
            )}
          />
        ))}
      </div>
      <p className="w-16 text-right text-[12px] text-muted" aria-live="polite">
        {level?.label ?? ""}
      </p>
    </div>
  );
}
