import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { request } from "../../../messaging/client.js";
import { Button } from "../../components/button.js";
import { Callout } from "../../components/callout.js";
import { ErrorText } from "../../components/error-text.js";
import { PasswordField } from "../../components/field.js";
import { EyeIcon, EyeOffIcon } from "../../components/icons.js";
import { PhraseGrid } from "../../components/phrase-grid.js";
import { errorCopy } from "../../errorCopy.js";
import { useAction } from "../../hooks/use-request.js";
import { StepHeading } from "./onboarding-shell.js";

// Reveal recovery phrase (KEY_MANAGEMENT §7.4): onboarding tab in reveal mode, password re-entry,
// blurred until clicked, auto-hides after 60 s or on tab blur. Only this page may receive the
// phrase (REVEAL_PHRASE is onboarding-only). Words are dropped when the tab closes.

const AUTO_HIDE_MS = 60_000;

const COPY = {
  title: "Your recovery phrase",
  body: "Enter your password to see your recovery phrase.",
  password: "Password",
  submit: "Continue",
  working: "Checking",
  warning:
    "Anyone who sees these words can take your funds. Make sure no one is watching your screen.",
  reveal: "Reveal",
  hide: "Hide",
  done: "Done",
  autoHide: "Hides automatically after a minute or when you leave this tab.",
} as const;

export function RevealPhraseScreen() {
  const passwordRef = useRef<HTMLInputElement>(null);
  const action = useAction();
  const [words, setWords] = useState<string[] | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!revealed) return;
    const hide = () => {
      setRevealed(false);
    };
    const timer = window.setTimeout(hide, AUTO_HIDE_MS);
    const onVisibility = () => {
      if (document.hidden) hide();
    };
    window.addEventListener("blur", hide);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("blur", hide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [revealed]);

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    const password = passwordRef.current?.value ?? "";
    if (password === "") return;
    const result = await action.run(() => request("REVEAL_PHRASE", { password }));
    if (passwordRef.current) passwordRef.current.value = "";
    if (result.ok) setWords(result.value.words);
  };

  if (words === null) {
    return (
      <form noValidate onSubmit={(e) => void submit(e)} data-testid="onboarding-reveal">
        <StepHeading title={COPY.title} body={COPY.body} />
        <div className="space-y-3">
          <PasswordField
            id="reveal-password"
            label={COPY.password}
            inputRef={passwordRef}
            autoFocus
            invalid={action.state.kind === "error"}
          />
          {action.state.kind === "error" && <ErrorText>{errorCopy(action.state.code)}</ErrorText>}
        </div>
        <Button type="submit" className="mt-7 w-full" busy={action.state.kind === "working"}>
          {action.state.kind === "working" ? COPY.working : COPY.submit}
        </Button>
      </form>
    );
  }

  return (
    <section data-testid="onboarding-reveal-words">
      <StepHeading title={COPY.title} />
      <div className="space-y-4">
        <Callout tone="warning">{COPY.warning}</Callout>
        <div className="rounded-xl bg-surface p-2 shadow-raised">
          <PhraseGrid words={words} revealed={revealed} />
        </div>
        <p className="text-[12px] text-faint">{COPY.autoHide}</p>
      </div>
      <div className="mt-7 flex gap-2.5">
        <Button
          variant="secondary"
          onClick={() => {
            setRevealed((r) => !r);
          }}
        >
          {revealed ? <EyeOffIcon /> : <EyeIcon />}
          {revealed ? COPY.hide : COPY.reveal}
        </Button>
        <Button
          className="flex-1"
          onClick={() => {
            setWords(null);
            window.close();
          }}
        >
          {COPY.done}
        </Button>
      </div>
    </section>
  );
}
