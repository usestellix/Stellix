import { cx } from "../cx.js";

/**
 * Numbered recovery-phrase grid (UI_FLOWS §2.2). Words aren't even in the DOM until revealed;
 * the blur hides the layout change. No copy button and no text selection (SECURITY §6).
 * Only filter/opacity transition (200ms): the reveal is a deliberate, rare action.
 */
export function PhraseGrid({ words, revealed }: { words: readonly string[]; revealed: boolean }) {
  return (
    <ol
      data-testid="phrase-grid"
      data-revealed={revealed}
      aria-hidden={!revealed}
      className={cx(
        "grid select-none grid-cols-3 gap-1.5 transition-[filter,opacity] duration-200 ease-out",
        !revealed && "pointer-events-none opacity-70 blur-[6px]",
      )}
    >
      {words.map((word, i) => (
        <li key={i} className="flex h-10 items-center gap-2.5 rounded-lg bg-fill px-3">
          <span className="tabular w-4 text-right text-[12px] text-faint">{i + 1}</span>
          <span
            className="font-mono text-[14px] text-ink"
            data-testid={`phrase-word-${String(i + 1)}`}
          >
            {revealed ? word : "•••••"}
          </span>
        </li>
      ))}
    </ol>
  );
}
