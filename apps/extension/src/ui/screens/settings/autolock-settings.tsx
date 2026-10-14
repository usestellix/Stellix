import { AUTO_LOCK_MINUTES, type Settings } from "@stellix/core";
import { request } from "../../../messaging/client.js";
import { ErrorText } from "../../components/error-text.js";
import { CheckIcon } from "../../components/icons.js";
import { SubScreen } from "../../components/sub-screen.js";
import { errorCopy } from "../../errorCopy.js";
import { useAction } from "../../hooks/use-request.js";

export function AutoLockSettings({
  settings,
  onBack,
  onChanged,
}: {
  settings: Settings;
  onBack: () => void;
  onChanged: (next: Settings) => void;
}) {
  const action = useAction();
  return (
    <SubScreen
      title="Auto-lock"
      network={settings.network}
      onBack={onBack}
      testId="settings-autolock"
    >
      <p className="mb-3 px-1 text-[13px] text-muted">
        Lock Stellix after this long without activity.
      </p>
      <div role="radiogroup" aria-label="Auto-lock" className="space-y-1">
        {AUTO_LOCK_MINUTES.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={settings.autoLockMinutes === m}
            onClick={() =>
              void action
                .run(() => request("SET_SETTINGS", { autoLockMinutes: m }))
                .then((r) => {
                  if (r.ok) onChanged(r.value);
                })
            }
            className="pressable flex h-11 w-full items-center rounded-lg px-3 text-left text-[14px] hover-fine:bg-fill"
          >
            <span className="flex-1">{m} minutes</span>
            {settings.autoLockMinutes === m && <CheckIcon size={16} />}
          </button>
        ))}
      </div>
      {action.state.kind === "error" && <ErrorText>{errorCopy(action.state.code)}</ErrorText>}
    </SubScreen>
  );
}
