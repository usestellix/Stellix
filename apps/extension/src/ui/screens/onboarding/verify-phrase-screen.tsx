import { MNEMONIC_WORDLIST, normalizeMnemonic, type VerifyAnswer } from "@stellix/core";
import { useRef, useState, type SubmitEvent } from "react";
import { Button } from "../../components/button.js";
import { ErrorText } from "../../components/error-text.js";

// Verify (UI_FLOWS §2.3): text inputs with wordlist autocomplete for the SW-chosen positions.
// Checked here for inline feedback; the SW checks again in ONBOARD_CREATE.

const COPY = {
  title: "Confirm your recovery phrase",
  body: "Type the words you wrote down.",
  word: (n: number) => `Word #${String(n)}`,
  wrong: "That's not the right word.",
  showAgain: "Show my phrase again",
  continue: "Continue",
} as const;

export function VerifyPhraseScreen({
  words,
  positions,
  onShowAgain,
  onVerified,
}: {
  words: readonly string[];
  positions: readonly number[];
  onShowAgain: () => void;
  onVerified: (answers: VerifyAnswer[]) => void;
}) {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const [wrong, setWrong] = useState<ReadonlySet<number>>(new Set());

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const answers = positions.map((position, i) => ({
      position,
      word: normalizeMnemonic(inputs.current[i]?.value ?? ""),
    }));
    const bad = new Set(answers.filter((a) => a.word !== words[a.position]).map((a) => a.position));
    setWrong(bad);
    if (bad.size === 0) onVerified(answers);
  };

  return (
    <form className="space-y-5" onSubmit={submit} data-testid="onboarding-verify">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{COPY.title}</h1>
        <p className="text-muted">{COPY.body}</p>
      </div>
      <datalist id="bip39-words">
        {MNEMONIC_WORDLIST.map((w) => (
          <option key={w} value={w} />
        ))}
      </datalist>
      {positions.map((position, i) => (
        <label key={position} className="block space-y-1 text-sm">
          <span className="font-medium">{COPY.word(position + 1)}</span>
          <input
            ref={(el) => {
              inputs.current[i] = el;
            }}
            data-testid={`verify-word-${String(position + 1)}`}
            list="bip39-words"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={wrong.has(position)}
            className={`w-full rounded-md border bg-surface px-3 py-2 font-mono ${wrong.has(position) ? "border-danger" : "border-line"}`}
          />
          {wrong.has(position) && <ErrorText>{COPY.wrong}</ErrorText>}
        </label>
      ))}
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onShowAgain}>
          {COPY.showAgain}
        </Button>
        <Button type="submit">{COPY.continue}</Button>
      </div>
    </form>
  );
}
