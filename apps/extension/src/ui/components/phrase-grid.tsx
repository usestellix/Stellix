/**
 * Numbered recovery-phrase grid (UI_FLOWS §2.2). Blurred until revealed; there is deliberately
 * no copy button (SECURITY §6) and text selection is disabled.
 */
export function PhraseGrid({ words, revealed }: { words: readonly string[]; revealed: boolean }) {
  return (
    <ol
      data-testid="phrase-grid"
      data-revealed={revealed}
      aria-hidden={!revealed}
      className={`grid select-none grid-cols-3 gap-2 transition ${revealed ? "" : "pointer-events-none blur-md"}`}
    >
      {words.map((word, i) => (
        <li
          key={i}
          className="flex gap-2 rounded-md border border-line px-3 py-2 font-mono text-sm"
        >
          <span className="w-5 text-right text-muted">{i + 1}</span>
          <span data-testid={`phrase-word-${String(i + 1)}`}>{revealed ? word : "•••••"}</span>
        </li>
      ))}
    </ol>
  );
}
