import {
  PASSWORD_MIN_LENGTH,
  meetsPasswordPolicy,
  passwordStrength,
  type NetworkId,
  type PasswordStrength,
} from "@stellix/core";
import { useRef, useState, type SubmitEvent } from "react";
import { request } from "../../../messaging/client.js";
import { Button } from "../../components/button.js";
import { ErrorText } from "../../components/error-text.js";
import { PasswordField } from "../../components/field.js";
import { StrengthMeter } from "../../components/strength-meter.js";
import { SubScreen } from "../../components/sub-screen.js";
import { errorCopy } from "../../errorCopy.js";
import { useAction } from "../../hooks/use-request.js";

// Change password (KEY_MANAGEMENT §7.5). Requires the current password even when unlocked.
// Uncontrolled inputs; the SW re-checks the policy and the throttle.

const COPY = {
  title: "Change password",
  current: "Current password",
  next: "New password",
  confirm: "Confirm new password",
  tooShort: `Use at least ${String(PASSWORD_MIN_LENGTH)} characters.`,
  mismatch: "The new passwords don't match.",
  submit: "Change password",
  working: "Re-encrypting",
  done: "Password changed.",
} as const;

export function ChangePasswordScreen({
  network,
  onBack,
}: {
  network: NetworkId;
  onBack: () => void;
}) {
  const currentRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const [strength, setStrength] = useState<PasswordStrength | null>(null);
  const [fieldError, setFieldError] = useState<"too-short" | "mismatch" | null>(null);
  const [done, setDone] = useState(false);
  const action = useAction();

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    const current = currentRef.current?.value ?? "";
    const next = nextRef.current?.value ?? "";
    if (!meetsPasswordPolicy(next)) {
      setFieldError("too-short");
      return;
    }
    if (next !== (confirmRef.current?.value ?? "")) {
      setFieldError("mismatch");
      return;
    }
    setFieldError(null);
    const result = await action.run(() => request("CHANGE_PASSWORD", { current, next }));
    for (const ref of [currentRef, nextRef, confirmRef]) if (ref.current) ref.current.value = "";
    setStrength(null);
    setDone(result.ok);
  };

  return (
    <SubScreen title={COPY.title} network={network} onBack={onBack} testId="settings-password">
      <form noValidate onSubmit={(e) => void submit(e)} className="space-y-4">
        <PasswordField
          id="current-password"
          label={COPY.current}
          inputRef={currentRef}
          autoFocus
          invalid={action.state.kind === "error"}
        />
        <PasswordField
          id="next-password"
          label={COPY.next}
          inputRef={nextRef}
          invalid={fieldError === "too-short"}
          onInput={(e) => {
            const v = e.currentTarget.value;
            setStrength(v === "" ? null : passwordStrength(v));
          }}
          hint={
            <div className="pt-1">
              <StrengthMeter strength={strength} />
              {fieldError === "too-short" && <ErrorText>{COPY.tooShort}</ErrorText>}
            </div>
          }
        />
        <PasswordField
          id="confirm-next-password"
          label={COPY.confirm}
          inputRef={confirmRef}
          invalid={fieldError === "mismatch"}
          hint={fieldError === "mismatch" ? <ErrorText>{COPY.mismatch}</ErrorText> : undefined}
        />
        {action.state.kind === "error" && <ErrorText>{errorCopy(action.state.code)}</ErrorText>}
        {done && (
          <p className="text-[13px] text-success" role="status">
            {COPY.done}
          </p>
        )}
        <Button type="submit" className="w-full" busy={action.state.kind === "working"}>
          {action.state.kind === "working" ? COPY.working : COPY.submit}
        </Button>
      </form>
    </SubScreen>
  );
}
