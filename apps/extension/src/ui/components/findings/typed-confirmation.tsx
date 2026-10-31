import { FINDINGS_UI_TEXT } from "@stellix/core";
import { FieldLabel, inputClass } from "../field.js";

// Review, typed (SHIELD §6.5): the user types the phrase the policy decision asked for. The
// phrase comes from the decision, so a rule-specific phrase needs no UI change. Not secret, so
// the value may live in React state.

export function TypedConfirmation({
  phrase,
  value,
  onChange,
  disabled = false,
}: {
  phrase: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [before, after] = FINDINGS_UI_TEXT.typedPrompt.split("{phrase}");
  return (
    <div className="space-y-1.5" data-testid="typed-confirmation">
      <p className="text-[13px] leading-5 text-ink-secondary">
        {before}
        <span className="font-mono font-semibold text-ink" data-testid="typed-phrase">
          {phrase}
        </span>
        {after}
      </p>
      <FieldLabel htmlFor="typed-confirmation-input">{FINDINGS_UI_TEXT.typedLabel}</FieldLabel>
      <input
        id="typed-confirmation-input"
        data-testid="typed-confirmation-input"
        type="text"
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        disabled={disabled}
        value={value}
        placeholder={phrase}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className={inputClass(false, "h-10 font-mono text-[15px]")}
      />
    </div>
  );
}
