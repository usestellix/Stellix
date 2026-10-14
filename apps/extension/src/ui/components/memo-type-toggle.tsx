import { cx } from "../cx.js";

const LABELS = { text: "Text", id: "ID" } as const;

/** Text / ID segmented control for memo fields (Send, Receive request). */
export function MemoTypeToggle({
  value,
  onChange,
}: {
  value: "text" | "id";
  onChange: (next: "text" | "id") => void;
}) {
  return (
    <div role="radiogroup" aria-label="Memo type" className="inline-flex rounded-md bg-fill p-0.5">
      {(["text", "id"] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={value === t}
          onClick={() => {
            onChange(t);
          }}
          className={cx(
            "h-6 rounded px-2 text-[12px] font-medium",
            value === t ? "bg-surface text-ink shadow-ring-strong" : "text-muted",
          )}
        >
          {LABELS[t]}
        </button>
      ))}
    </div>
  );
}
