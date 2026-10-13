import {
  IMPORT_WORD_COUNTS,
  MNEMONIC_WORDLIST,
  isMnemonicWord,
  normalizeMnemonic,
  parseMnemonic,
  unknownWordPositions,
} from "@stellix/core";
import { useEffect, useRef, useState, type ClipboardEvent, type SubmitEvent } from "react";
import { cx } from "../../cx.js";
import { Button } from "../../components/button.js";
import { ErrorText } from "../../components/error-text.js";
import { inputClass } from "../../components/field.js";
import { errorCopy } from "../../errorCopy.js";
import { StepHeading } from "./onboarding-shell.js";

// Import (UI_FLOWS §2.5, KEY_MANAGEMENT §1): one uncontrolled input per word, paste-to-fill,
// per-word wordlist check, checksum message. Never auto-corrects. Words never enter React state;
// only the positions of unknown words do.

type WordCount = (typeof IMPORT_WORD_COUNTS)[number];

const COPY = {
  title: "Enter your recovery phrase",
  body: "Paste the whole phrase into the first box to fill them all, or type each word.",
  words: (n: number) => `${String(n)} words`,
  word: (n: number) => `Word ${String(n)}`,
  continue: "Continue",
  missing: (n: number) => `Enter all ${String(n)} words.`,
} as const;

export function ImportPhraseScreen({ onContinue }: { onContinue: (mnemonic: string) => void }) {
  const [count, setCount] = useState<WordCount>(12);
  const [unknown, setUnknown] = useState<ReadonlySet<number>>(new Set());
  const [checksumError, setChecksumError] = useState(false);
  // The summary message appears only after a submit. Blur feedback is the outline alone: inserting
  // a message on blur shifts the Continue button mid-click, so the click misses (found in review).
  const [submitted, setSubmitted] = useState<null | "missing" | "unknown">(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const pendingFill = useRef<{ from: number; words: string[] } | null>(null);

  const fill = (from: number, words: readonly string[]) => {
    words.forEach((word, i) => {
      const el = inputs.current[from + i];
      if (el) el.value = word;
    });
    setUnknown(new Set(unknownWordPositions(words).map((p) => p + from)));
    setChecksumError(false);
  };

  // A pasted 24-word phrase switches the grid to 24 first, then fills after render.
  useEffect(() => {
    const pending = pendingFill.current;
    if (pending !== null) {
      pendingFill.current = null;
      fill(pending.from, pending.words);
    }
  }, [count]);

  const onPaste = (index: number) => (event: ClipboardEvent<HTMLInputElement>) => {
    const words = normalizeMnemonic(event.clipboardData.getData("text")).split(" ").filter(Boolean);
    if (words.length < 2) return;
    event.preventDefault();
    if (
      index === 0 &&
      (IMPORT_WORD_COUNTS as readonly number[]).includes(words.length) &&
      words.length !== count
    ) {
      pendingFill.current = { from: 0, words };
      setCount(words.length as WordCount);
      return;
    }
    fill(index, words.slice(0, count - index));
  };

  const onBlur = (index: number) => () => {
    const value = (inputs.current[index]?.value ?? "").trim();
    setUnknown((prev) => {
      const next = new Set(prev);
      if (value !== "" && !isMnemonicWord(value)) next.add(index);
      else next.delete(index);
      return next;
    });
  };

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    const words = Array.from({ length: count }, (_, i) =>
      normalizeMnemonic(inputs.current[i]?.value ?? ""),
    );
    const bad = new Set(unknownWordPositions(words));
    setUnknown(bad);
    if (bad.size > 0) {
      setSubmitted(words.some((w) => w === "") ? "missing" : "unknown");
      inputs.current[Math.min(...bad)]?.focus();
      return;
    }
    setSubmitted(null);
    try {
      onContinue(parseMnemonic(words.join(" ")));
    } catch {
      setChecksumError(true);
    }
  };

  return (
    <form onSubmit={submit} data-testid="onboarding-import" noValidate>
      <StepHeading title={COPY.title} body={COPY.body} />
      <div
        role="radiogroup"
        aria-label="Phrase length"
        className="mb-5 inline-flex rounded-lg bg-fill p-0.5"
      >
        {IMPORT_WORD_COUNTS.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={count === n}
            onClick={() => {
              setCount(n);
              setUnknown(new Set());
              setChecksumError(false);
              setSubmitted(null);
            }}
            className={cx(
              "h-8 rounded-md px-3.5 text-[13px] font-medium transition-[background-color,box-shadow,color] duration-150",
              count === n
                ? "bg-surface text-ink shadow-ring-strong"
                : "text-muted hover-fine:text-ink",
            )}
          >
            {COPY.words(n)}
          </button>
        ))}
      </div>
      <datalist id="bip39-words">
        {MNEMONIC_WORDLIST.map((w) => (
          <option key={w} value={w} />
        ))}
      </datalist>
      <ol className="grid grid-cols-3 gap-2">
        {Array.from({ length: count }, (_, i) => (
          <li key={`${String(count)}-${String(i)}`} className="relative">
            <span
              aria-hidden="true"
              className="tabular pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-[11px] text-faint"
            >
              {i + 1}
            </span>
            <input
              ref={(el) => {
                inputs.current[i] = el;
              }}
              aria-label={COPY.word(i + 1)}
              data-testid={`import-word-${String(i + 1)}`}
              list="bip39-words"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={unknown.has(i)}
              onPaste={onPaste(i)}
              onBlur={onBlur(i)}
              className={inputClass(unknown.has(i), "h-9 pl-7 font-mono text-[13px]")}
            />
          </li>
        ))}
      </ol>
      <div className="mt-4 space-y-2">
        {submitted === "missing" && <ErrorText>{COPY.missing(count)}</ErrorText>}
        {submitted === "unknown" && unknown.size > 0 && (
          <ErrorText>{errorCopy("INVALID_MNEMONIC_WORD")}</ErrorText>
        )}
        {checksumError && <ErrorText>{errorCopy("INVALID_MNEMONIC_CHECKSUM")}</ErrorText>}
      </div>
      <Button type="submit" className="mt-6 w-full">
        {COPY.continue}
      </Button>
    </form>
  );
}
