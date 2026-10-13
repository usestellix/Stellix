import { useEffect, useState } from "react";
import { Button } from "../../components/button.js";
import { PhraseGrid } from "../../components/phrase-grid.js";

// Show phrase (UI_FLOWS §2.2, SECURITY §6): warning first, grid blurred until "Reveal",
// auto-hides after 60 s or when the tab loses focus. No copy button.

const AUTO_HIDE_MS = 60_000;

const COPY = {
  title: "Your recovery phrase",
  warning:
    "Your recovery phrase is the only way to restore your wallet. Anyone who has it can take your funds. Write it on paper. Don't screenshot it.",
  reveal: "Reveal",
  hide: "Hide",
  continue: "I've written it down",
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
    <section className="space-y-5" data-testid="onboarding-show">
      <h1 className="text-2xl font-semibold">{COPY.title}</h1>
      <p role="note" className="rounded-md bg-warning-bg p-3 text-sm text-warning-fg">
        {COPY.warning}
      </p>
      <PhraseGrid words={words} revealed={revealed} />
      <div className="flex gap-3">
        <Button
          variant="secondary"
          onClick={() => {
            setRevealed((r) => !r);
            setSeen(true);
          }}
        >
          {revealed ? COPY.hide : COPY.reveal}
        </Button>
        <Button disabled={!seen} onClick={onContinue}>
          {COPY.continue}
        </Button>
      </div>
    </section>
  );
}
