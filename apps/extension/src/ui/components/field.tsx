import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { cx } from "../cx.js";

/** Shared input styling: shadow ring instead of a border, stronger ring on focus/invalid. */
export function inputClass(invalid: boolean, extra?: string): string {
  // Exactly one ring set per state: Tailwind orders conflicting utilities by generated CSS order,
  // not class order, so the invalid ring must not compete with the normal focus ring.
  return cx(
    "w-full rounded-lg bg-surface px-3 text-ink placeholder:text-faint outline-none transition-[box-shadow] duration-150",
    invalid
      ? "shadow-[0_0_0_1px_var(--color-danger)] focus:shadow-[0_0_0_1px_var(--color-danger),0_0_0_4px_var(--color-danger-fill)]"
      : "shadow-ring-strong focus:shadow-[0_0_0_1px_var(--color-focus),0_0_0_4px_color-mix(in_srgb,var(--color-focus)_18%,transparent)]",
    extra,
  );
}

export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-secondary">
      {children}
    </label>
  );
}

/**
 * Uncontrolled password field: the value lives only in the DOM and is read on submit, so it
 * never enters React state (apps/extension/CLAUDE.md).
 */
export function PasswordField({
  label,
  inputRef,
  invalid = false,
  hint,
  id,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "id"> & {
  label: string;
  inputRef: Ref<HTMLInputElement>;
  invalid?: boolean;
  hint?: ReactNode;
  id: string;
}) {
  return (
    <div className="space-y-1.5">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input
        id={id}
        ref={inputRef}
        type="password"
        autoComplete="off"
        spellCheck={false}
        aria-invalid={invalid}
        className={inputClass(invalid, "h-10 text-[15px] tracking-wide")}
        {...props}
      />
      {hint}
    </div>
  );
}
