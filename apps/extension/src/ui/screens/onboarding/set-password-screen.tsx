import {
  PASSWORD_MIN_LENGTH,
  meetsPasswordPolicy,
  passwordStrength,
  type PasswordStrength,
} from "@stellix/core";
import { useRef, useState, type SubmitEvent } from "react";
import { Button } from "../../components/button.js";
import { Callout } from "../../components/callout.js";
import { ErrorText } from "../../components/error-text.js";
import { PasswordField } from "../../components/field.js";
import { StrengthMeter } from "../../components/strength-meter.js";
import { errorCopy } from "../../errorCopy.js";
import { useAction } from "../../hooks/use-request.js";
import { StepHeading } from "./onboarding-shell.js";

// Password (UI_FLOWS §2.4, KEY_MANAGEMENT §5). Inputs are uncontrolled; only the strength level
// is kept in state.

const COPY = {
  title: "Choose a password",
  body: "You'll use it to unlock Stellix on this device.",
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
  onDone: (result: unknown) => void;
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
      passwordRef.current?.focus();
      return;
    }
    if (password !== confirm) {
      setFieldError("mismatch");
      confirmRef.current?.focus();
      return;
    }
    setFieldError(null);
    const result = await action.run(() => submit(password));
    if (result.ok) onDone(result.value);
    else if (result.code === "ONBOARDING_EXPIRED") onExpired();
  };

  const working = action.state.kind === "working";
  return (
    <form onSubmit={(e) => void onSubmit(e)} data-testid="onboarding-password" noValidate>
      <StepHeading title={COPY.title} body={COPY.body} />
      <div className="space-y-5">
        <PasswordField
          id="new-password"
          label={COPY.password}
          inputRef={passwordRef}
          name="new-password"
          autoFocus
          invalid={fieldError === "too-short"}
          onInput={(e) => {
            const value = e.currentTarget.value;
            setStrength(value === "" ? null : passwordStrength(value));
            if (fieldError === "too-short") setFieldError(null);
          }}
          hint={
            <div className="pt-1">
              <StrengthMeter strength={strength} />
              {fieldError === "too-short" && <ErrorText>{COPY.tooShort}</ErrorText>}
            </div>
          }
        />
        <PasswordField
          id="confirm-password"
          label={COPY.confirm}
          inputRef={confirmRef}
          name="confirm-password"
          invalid={fieldError === "mismatch"}
          onInput={() => {
            if (fieldError === "mismatch") setFieldError(null);
          }}
          hint={fieldError === "mismatch" ? <ErrorText>{COPY.mismatch}</ErrorText> : undefined}
        />
        <Callout tone="security">{COPY.notice}</Callout>
        {action.state.kind === "error" && <ErrorText>{errorCopy(action.state.code)}</ErrorText>}
      </div>
      <Button type="submit" busy={working} className="mt-8 w-full">
        {working ? workingText : COPY.submit}
      </Button>
    </form>
  );
}
