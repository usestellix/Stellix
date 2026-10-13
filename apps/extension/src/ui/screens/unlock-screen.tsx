import type { NetworkId } from "@stellix/core";
import { useRef, useState, type SubmitEvent } from "react";
import { request } from "../../messaging/client.js";
import { Button } from "../components/button.js";
import { ErrorText } from "../components/error-text.js";
import { PasswordField } from "../components/field.js";
import { PopupHeader } from "../components/popup-header.js";
import { Wordmark } from "../components/wordmark.js";
import { errorCopy } from "../errorCopy.js";
import { useAction } from "../hooks/use-request.js";
import { useShake } from "../hooks/use-shake.js";

// Unlock (UI_FLOWS §3). The 5-attempt / 30 s throttle is enforced in the SW (UNLOCK_THROTTLED);
// this screen only shows the result. No entrance animation: unlock happens many times a day.

const COPY = {
  title: "Welcome back",
  body: "Enter your password to unlock.",
  password: "Password",
  unlock: "Unlock",
  working: "Unlocking",
  forgot: "Forgot password?",
  forgotBody:
    "Stellix can't recover your password. Reset the wallet from Settings, then restore it with your recovery phrase.",
} as const;

export function UnlockScreen({
  network,
  onUnlocked,
}: {
  network: NetworkId;
  onUnlocked: () => void;
}) {
  const passwordRef = useRef<HTMLInputElement>(null);
  const { state, run } = useAction();
  const [formRef, shake] = useShake<HTMLFormElement>();
  const [showForgot, setShowForgot] = useState(false);

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    const input = passwordRef.current;
    if (input === null || input.value === "") return;
    const password = input.value;
    const result = await run(() => request("UNLOCK", { password }));
    input.value = "";
    if (!result.ok) {
      if (result.code === "INVALID_PASSWORD") shake();
      input.focus();
      return;
    }
    onUnlocked();
  };

  const error = state.kind === "error" ? state.code : null;
  return (
    <div data-testid="popup" data-screen="unlock" className="flex h-full flex-col bg-surface">
      <PopupHeader network={network} leading={<Wordmark />} />
      <form
        ref={formRef}
        onSubmit={(e) => void submit(e)}
        className="flex flex-1 flex-col justify-center gap-5 px-5 pb-10"
      >
        <div className="space-y-1">
          <h1 className="text-[22px] font-semibold leading-[1.2] tracking-[-0.02em]">
            {COPY.title}
          </h1>
          <p className="text-muted">{COPY.body}</p>
        </div>
        <div className="space-y-2">
          <PasswordField
            id="unlock-password"
            label={COPY.password}
            inputRef={passwordRef}
            autoFocus
            name="password"
            invalid={error !== null}
            aria-describedby={error !== null ? "unlock-error" : undefined}
          />
          {error !== null && <ErrorText id="unlock-error">{errorCopy(error)}</ErrorText>}
        </div>
        <Button type="submit" className="w-full" busy={state.kind === "working"}>
          {state.kind === "working" ? COPY.working : COPY.unlock}
        </Button>
        <div className="space-y-2 text-center">
          <button
            type="button"
            aria-expanded={showForgot}
            className="text-[13px] text-muted underline-offset-4 hover-fine:text-ink hover-fine:underline"
            onClick={() => {
              setShowForgot((v) => !v);
            }}
          >
            {COPY.forgot}
          </button>
          {showForgot && <p className="text-[13px] leading-5 text-muted">{COPY.forgotBody}</p>}
        </div>
      </form>
    </div>
  );
}
