import { useEffect, useState } from "react";
import { Button } from "../../components/button.js";
import { Callout } from "../../components/callout.js";
import { EyeIcon, EyeOffIcon } from "../../components/icons.js";
import { PhraseGrid } from "../../components/phrase-grid.js";
import { StepHeading } from "./onboarding-shell.js";

// Show phrase (UI_FLOWS §2.2, SECURITY §6): warning first, grid hidden until "Reveal",
// auto-hides after 60 s or when the tab loses focus. No copy button.

const AUTO_HIDE_MS = 60_000;

const COPY = {
  title: "Write down your recovery phrase",
  body: "These 12 words, in this order, are the only way to restore your wallet.",
  warning:
    "Anyone who has these words can take your funds. Write them on paper and keep it somewhere safe. Don't screenshot them or store them online.",
  reveal: "Reveal",
  hide: "Hide",
  continue: "I've written it down",
  autoHide: "Hides automatically after a minute or when you leave this tab.",
} as const;

export function ShowPhraseScreen({
  words,
  onContinue,
}: {
  words: readonly string[];
  onContinue: () => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const [seen, setSeen] = useState(false);

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

  return (
    <section data-testid="onboarding-show">
      <StepHeading title={COPY.title} body={COPY.body} />
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
            setSeen(true);
          }}
        >
          {revealed ? <EyeOffIcon /> : <EyeIcon />}
          {revealed ? COPY.hide : COPY.reveal}
        </Button>
        <Button disabled={!seen} onClick={onContinue} className="flex-1">
          {COPY.continue}
        </Button>
      </div>
    </section>
  );
}
