import { NETWORKS, type Settings } from "@stellix/core";
import { useRef, useState, type SubmitEvent } from "react";
import { request } from "../../../messaging/client.js";
import { Button } from "../../components/button.js";
import { Callout } from "../../components/callout.js";
import { ErrorText } from "../../components/error-text.js";
import { FieldLabel, inputClass } from "../../components/field.js";
import { SubScreen } from "../../components/sub-screen.js";
import { errorCopy } from "../../errorCopy.js";
import { useAction } from "../../hooks/use-request.js";

// Custom Horizon URL (UI_FLOWS §9, NETWORK.md §1, SECURITY T12). Validated in the SW by
// passphrase probe before it's saved.

const COPY = {
  title: "Custom Horizon URL",
  warning:
    "Only use a Horizon server you trust. It can't move your funds, but it can show you wrong balances and history.",
  label: (network: string) => `Horizon URL for ${network}`,
  save: "Save",
  saving: "Checking server",
  reset: "Use default",
  saved: "Saved. Stellix checked that this server is on the right network.",
  current: "Default:",
} as const;

export function HorizonSettings({
  settings,
  onBack,
  onChanged,
}: {
  settings: Settings;
  onBack: () => void;
  onChanged: (next: Settings) => void;
}) {
  const network = settings.network;
  const config = NETWORKS[network];
  const inputRef = useRef<HTMLInputElement>(null);
  const action = useAction();
  const [saved, setSaved] = useState(false);

  const submit = async (url: string | null) => {
    setSaved(false);
    const result = await action.run(() =>
      request("SET_SETTINGS", { horizonOverride: { network, url } }),
    );
    if (result.ok) {
      if (url === null && inputRef.current) inputRef.current.value = "";
      setSaved(url !== null);
      onChanged(result.value);
    }
  };

  return (
    <SubScreen title={COPY.title} network={network} onBack={onBack} testId="settings-horizon">
      <div className="space-y-4">
        <Callout tone="warning">{COPY.warning}</Callout>
        <form
          noValidate
          onSubmit={(e: SubmitEvent) => {
            e.preventDefault();
            void submit(inputRef.current?.value ?? "");
          }}
          className="space-y-2"
        >
          <FieldLabel htmlFor="horizon-url">{COPY.label(config.label)}</FieldLabel>
          <input
            id="horizon-url"
            ref={inputRef}
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            placeholder={config.horizonUrl}
            defaultValue={settings.horizonOverrides[network] ?? ""}
            aria-invalid={action.state.kind === "error"}
            className={inputClass(action.state.kind === "error", "h-10 font-mono text-[13px]")}
          />
          <p className="text-[12px] text-faint">
            {COPY.current} <span className="font-mono">{config.horizonUrl}</span>
          </p>
          {action.state.kind === "error" && <ErrorText>{errorCopy(action.state.code)}</ErrorText>}
          {saved && <p className="text-[12px] text-success">{COPY.saved}</p>}
          <div className="flex gap-2 pt-2">
            <Button type="submit" className="flex-1" busy={action.state.kind === "working"}>
              {action.state.kind === "working" ? COPY.saving : COPY.save}
            </Button>
            <Button
              variant="secondary"
              disabled={settings.horizonOverrides[network] === undefined}
              onClick={() => void submit(null)}
            >
              {COPY.reset}
            </Button>
          </div>
        </form>
      </div>
    </SubScreen>
  );
}
