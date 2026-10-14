import { MNEMONIC_WORDLIST, normalizeMnemonic, type VerifyAnswer } from "@stellix/core";
import { useRef, useState, type SubmitEvent } from "react";
import { Button } from "../../components/button.js";
import { ErrorText } from "../../components/error-text.js";
import { FieldLabel, inputClass } from "../../components/field.js";
import { StepHeading } from "./onboarding-shell.js";

// Verify (UI_FLOWS §2.3): text inputs with wordlist autocomplete for the SW-chosen positions.
// Checked here for inline feedback; the SW checks again in ONBOARD_CREATE.

const COPY = {
  title: "Confirm your recovery phrase",
  body: "Type these words from the phrase you wrote down.",
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
    if (bad.size > 0) {
      inputs.current[positions.findIndex((p) => bad.has(p))]?.focus();
      return;
    }
    onVerified(answers);
  };

  return (
    <form onSubmit={submit} data-testid="onboarding-verify" noValidate>
      <StepHeading title={COPY.title} body={COPY.body} />
      <datalist id="bip39-words">
        {MNEMONIC_WORDLIST.map((w) => (
          <option key={w} value={w} />
        ))}
      </datalist>
      <div className="space-y-4">
        {positions.map((position, i) => {
          const id = `verify-${String(position)}`;
          const invalid = wrong.has(position);
          return (
            <div key={position} className="space-y-1.5">
              <FieldLabel htmlFor={id}>{COPY.word(position + 1)}</FieldLabel>
              <input
                id={id}
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                autoFocus={i === 0}
                data-testid={`verify-word-${String(position + 1)}`}
                list="bip39-words"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={invalid}
                className={inputClass(invalid, "h-10 font-mono text-[15px]")}
                onInput={() => {
                  if (invalid) setWrong((prev) => new Set([...prev].filter((p) => p !== position)));
                }}
              />
              {invalid && <ErrorText>{COPY.wrong}</ErrorText>}
            </div>
          );
        })}
      </div>
      <div className="mt-8 flex gap-2.5">
        <Button variant="secondary" onClick={onShowAgain}>
          {COPY.showAgain}
        </Button>
        <Button type="submit" className="flex-1">
          {COPY.continue}
        </Button>
      </div>
    </form>
  );
}
