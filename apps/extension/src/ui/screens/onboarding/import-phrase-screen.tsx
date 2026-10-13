import {
  IMPORT_WORD_COUNTS,
  MNEMONIC_WORDLIST,
  isMnemonicWord,
  normalizeMnemonic,
  parseMnemonic,
  unknownWordPositions,
} from "@stellix/core";
import { useEffect, useRef, useState, type ClipboardEvent, type SubmitEvent } from "react";
import { Button } from "../../components/button.js";
import { ErrorText } from "../../components/error-text.js";
import { errorCopy } from "../../errorCopy.js";

// Import (UI_FLOWS §2.5, KEY_MANAGEMENT §1): one uncontrolled input per word, paste-to-fill,
// per-word wordlist check, checksum message. Never auto-corrects. Words never enter React state;
// only the positions of unknown words do.

type WordCount = (typeof IMPORT_WORD_COUNTS)[number];

const COPY = {
  title: "Import your recovery phrase",
  body: "Enter your 12- or 24-word recovery phrase. Pasting the whole phrase into the first box fills them all.",
  words: (n: number) => `${String(n)} words`,
  word: (n: number) => `Word ${String(n)}`,
  continue: "Continue",
} as const;

export function ImportPhraseScreen({ onContinue }: { onContinue: (mnemonic: string) => void }) {
  const [count, setCount] = useState<WordCount>(12);
  const [unknown, setUnknown] = useState<ReadonlySet<number>>(new Set());
  const [checksumError, setChecksumError] = useState(false);
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
    const value = inputs.current[index]?.value ?? "";
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
    if (bad.size > 0) return;
    try {
      onContinue(parseMnemonic(words.join(" ")));
    } catch {
      setChecksumError(true);
    }
  };

  return (
    <form className="space-y-5" onSubmit={submit} data-testid="onboarding-import">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{COPY.title}</h1>
        <p className="text-muted">{COPY.body}</p>
      </div>
      <div className="flex gap-2" role="radiogroup">
        {IMPORT_WORD_COUNTS.map((n) => (
          <Button
            key={n}
            role="radio"
            aria-checked={count === n}
            variant={count === n ? "primary" : "secondary"}
            onClick={() => {
              setCount(n);
              setUnknown(new Set());
            }}
          >
            {COPY.words(n)}
          </Button>
        ))}
      </div>
      <datalist id="bip39-words">
        {MNEMONIC_WORDLIST.map((w) => (
          <option key={w} value={w} />
        ))}
      </datalist>
      <ol className="grid grid-cols-3 gap-2">
        {Array.from({ length: count }, (_, i) => (
          <li key={`${String(count)}-${String(i)}`}>
            <input
              ref={(el) => {
                inputs.current[i] = el;
              }}
              aria-label={COPY.word(i + 1)}
              data-testid={`import-word-${String(i + 1)}`}
              placeholder={String(i + 1)}
              list="bip39-words"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={unknown.has(i)}
              onPaste={onPaste(i)}
              onBlur={onBlur(i)}
              className={`w-full rounded-md border bg-surface px-2 py-1.5 font-mono text-sm ${unknown.has(i) ? "border-danger" : "border-line"}`}
            />
          </li>
        ))}
      </ol>
      {unknown.size > 0 && <ErrorText>{errorCopy("INVALID_MNEMONIC_WORD")}</ErrorText>}
      {checksumError && <ErrorText>{errorCopy("INVALID_MNEMONIC_CHECKSUM")}</ErrorText>}
      <Button type="submit" className="w-full">
        {COPY.continue}
      </Button>
    </form>
  );
}
