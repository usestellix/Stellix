import {
  PASSWORD_MIN_LENGTH,
  meetsPasswordPolicy,
  passwordStrength,
  type PasswordStrength,
} from "@stellix/core";
import { useRef, useState, type SubmitEvent } from "react";
import { Button } from "../../components/button.js";
import { ErrorText } from "../../components/error-text.js";
import { PasswordInput } from "../../components/password-input.js";
import { StrengthMeter } from "../../components/strength-meter.js";
import { errorCopy } from "../../errorCopy.js";
import { useAction } from "../../hooks/use-request.js";

// Password (UI_FLOWS §2.4, KEY_MANAGEMENT §5). Inputs are uncontrolled; only the strength level
// is kept in state.

const COPY = {
  title: "Set a password",
  body: "You'll use this password to unlock Stellix on this device.",
  password: "Password",
  confirm: "Confirm password",
  notice:
    "Stellix can't recover this password. If you forget it, you'll need your recovery phrase.",
  tooShort: `Use at least ${String(PASSWORD_MIN_LENGTH)} characters.`,
  mismatch: "The passwords don't match.",
  submit: "Create wallet",
} as const;

type FieldError = "too-short" | "mismatch" | null;

export function SetPasswordScreen({
  workingText,
  submit,
  onDone,
  onExpired,
}: {
  workingText: string;
  submit: (password: string) => Promise<unknown>;
  onDone: () => void;
  onExpired: () => void;
}) {
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const [strength, setStrength] = useState<PasswordStrength | null>(null);
  const [fieldError, setFieldError] = useState<FieldError>(null);
  const action = useAction();

  const onSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    const password = passwordRef.current?.value ?? "";
    const confirm = confirmRef.current?.value ?? "";
    if (!meetsPasswordPolicy(password)) {
      setFieldError("too-short");
      return;
    }
    if (password !== confirm) {
      setFieldError("mismatch");
      return;
    }
    setFieldError(null);
    const result = await action.run(() => submit(password));
    if (result.ok) {
      onDone();
    } else if (result.code === "ONBOARDING_EXPIRED") {
      onExpired();
    }
  };

  const working = action.state.kind === "working";
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => void onSubmit(e)}
      data-testid="onboarding-password"
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{COPY.title}</h1>
        <p className="text-muted">{COPY.body}</p>
      </div>
      <PasswordInput
        label={COPY.password}
        inputRef={passwordRef}
        name="new-password"
        autoFocus
        invalid={fieldError === "too-short"}
        onInput={(e) => {
          const value = e.currentTarget.value;
          setStrength(value === "" ? null : passwordStrength(value));
        }}
      />
      <StrengthMeter strength={strength} />
      <PasswordInput
        label={COPY.confirm}
        inputRef={confirmRef}
        name="confirm-password"
        invalid={fieldError === "mismatch"}
      />
      {fieldError === "too-short" && <ErrorText>{COPY.tooShort}</ErrorText>}
      {fieldError === "mismatch" && <ErrorText>{COPY.mismatch}</ErrorText>}
      <p className="rounded-md bg-warning-bg p-3 text-sm text-warning-fg">{COPY.notice}</p>
      {action.state.kind === "error" && <ErrorText>{errorCopy(action.state.code)}</ErrorText>}
      <Button type="submit" disabled={working} className="w-full">
        {working ? workingText : COPY.submit}
      </Button>
    </form>
  );
}
