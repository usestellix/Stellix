import type { InputHTMLAttributes, Ref } from "react";

/**
 * Uncontrolled password field: the value lives only in the DOM and is read on submit, so it
 * never enters React state (CONVENTIONS §6).
 */
export function PasswordInput({
  label,
  inputRef,
  invalid = false,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue"> & {
  label: string;
  inputRef: Ref<HTMLInputElement>;
  invalid?: boolean;
}) {
  return (
    <label className="block space-y-1 text-sm">
      <span className="font-medium">{label}</span>
      <input
        ref={inputRef}
        type="password"
        autoComplete="off"
        spellCheck={false}
        aria-invalid={invalid}
        className={`w-full rounded-md border bg-surface px-3 py-2 ${invalid ? "border-danger" : "border-line"}`}
        {...props}
      />
    </label>
  );
}
