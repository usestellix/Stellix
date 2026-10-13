import type { NetworkId } from "@stellix/core";
import { useRef, useState, type SubmitEvent } from "react";
import { request } from "../../messaging/client.js";
import { Button } from "../components/button.js";
import { ErrorText } from "../components/error-text.js";
import { NetworkBadge } from "../components/network-badge.js";
import { PasswordInput } from "../components/password-input.js";
import { errorCopy } from "../errorCopy.js";
import { useAction } from "../hooks/use-request.js";

// Unlock (UI_FLOWS §3). The 5-attempt / 30 s throttle is enforced in the SW (UNLOCK_THROTTLED);
// this screen only shows the result.

const COPY = {
  title: "Unlock Stellix",
  password: "Password",
  unlock: "Unlock",
  working: "Unlocking…",
  forgot: "Forgot password?",
  forgotBody:
    "Stellix can't recover your password. Reset the wallet from Settings and restore it with your recovery phrase.",
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
  const [attempt, setAttempt] = useState(0);
  const [showForgot, setShowForgot] = useState(false);

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    const input = passwordRef.current;
    if (input === null || input.value === "") return;
    const password = input.value;
    const result = await run(() => request("UNLOCK", { password }));
    input.value = "";
    if (!result.ok) {
      setAttempt((n) => n + 1);
      input.focus();
      return;
    }
    onUnlocked();
  };

  return (
    <div data-testid="popup" data-screen="unlock" className="flex h-full flex-col">
      <header className="flex justify-end border-b border-line px-4 py-3">
        <NetworkBadge network={network} />
      </header>
      <form
        onSubmit={(e) => void submit(e)}
        className={`flex flex-1 flex-col justify-center gap-4 p-6 ${state.kind === "error" && state.code === "INVALID_PASSWORD" ? "animate-shake" : ""}`}
        key={attempt}
      >
        <h1 className="text-center text-xl font-semibold">{COPY.title}</h1>
        <PasswordInput
          label={COPY.password}
          inputRef={passwordRef}
          autoFocus
          name="password"
          invalid={state.kind === "error"}
        />
        {state.kind === "error" && <ErrorText>{errorCopy(state.code)}</ErrorText>}
        <Button type="submit" disabled={state.kind === "working"}>
          {state.kind === "working" ? COPY.working : COPY.unlock}
        </Button>
        <button
          type="button"
          className="text-sm text-muted underline"
          onClick={() => {
            setShowForgot((v) => !v);
          }}
        >
          {COPY.forgot}
        </button>
        {showForgot && <p className="text-sm text-muted">{COPY.forgotBody}</p>}
      </form>
    </div>
  );
}
