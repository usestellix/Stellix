import type { PasswordStrength } from "@stellix/core";

const LEVELS = {
  weak: { bars: 1, label: "Too weak", color: "bg-danger" },
  fair: { bars: 2, label: "Fair", color: "bg-warning-fg" },
  good: { bars: 3, label: "Good", color: "bg-success" },
  strong: { bars: 4, label: "Strong", color: "bg-success" },
} as const satisfies Record<PasswordStrength, { bars: number; label: string; color: string }>;

export function StrengthMeter({ strength }: { strength: PasswordStrength | null }) {
  const level = strength === null ? null : LEVELS[strength];
  return (
    <div className="space-y-1" data-testid="strength-meter" data-strength={strength ?? "none"}>
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded ${level !== null && i <= level.bars ? level.color : "bg-line"}`}
          />
        ))}
      </div>
      <p className="text-xs text-muted">{level === null ? " " : `Strength: ${level.label}`}</p>
    </div>
  );
}
