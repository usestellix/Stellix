import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../cx.js";
import { Spinner } from "./spinner.js";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "sm";

const VARIANTS = {
  primary: "bg-primary text-primary-fg hover-fine:bg-primary-hover",
  secondary: "bg-surface text-ink shadow-ring-strong hover-fine:bg-fill",
  ghost: "text-ink-secondary hover-fine:bg-fill hover-fine:text-ink",
  danger: "bg-danger text-white hover-fine:opacity-90",
} as const satisfies Record<Variant, string>;

const SIZES = {
  md: "h-10 px-4 text-[14px]",
  sm: "h-8 px-3 text-[13px]",
} as const satisfies Record<Size, string>;

export function Button({
  variant = "primary",
  size = "md",
  busy = false,
  className,
  type = "button",
  disabled,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Shows a spinner and blocks repeat presses; the label stays so the width doesn't jump. */
  busy?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type={type}
      disabled={disabled === true || busy}
      aria-busy={busy || undefined}
      className={cx(
        "pressable inline-flex select-none items-center justify-center gap-2 rounded-lg font-medium tracking-[-0.005em]",
        "disabled:cursor-not-allowed disabled:opacity-45",
        busy && "disabled:opacity-100",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

/** Square icon-only button. `label` is required: it's the accessible name and the tooltip. */
export function IconButton({
  label,
  className,
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "title"> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "pressable inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-secondary",
        "hover-fine:bg-fill hover-fine:text-ink",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
