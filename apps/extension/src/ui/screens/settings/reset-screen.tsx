import { RESET_CONFIRMATION, type NetworkId } from "@stellix/core";
import { useState } from "react";
import { request } from "../../../messaging/client.js";
import { Button } from "../../components/button.js";
import { Callout } from "../../components/callout.js";
import { ErrorText } from "../../components/error-text.js";
import { FieldLabel, inputClass } from "../../components/field.js";
import { SubScreen } from "../../components/sub-screen.js";
import { errorCopy } from "../../errorCopy.js";
import { useAction } from "../../hooks/use-request.js";

// Reset wallet (KEY_MANAGEMENT §7.6): typed "RESET". The SW checks the exact text too.

const COPY = {
  title: "Reset wallet",
  warning:
    "This erases Stellix from this browser: your encrypted recovery phrase, accounts and settings. Without your recovery phrase, your funds are gone for good.",
  label: `Type ${RESET_CONFIRMATION} to confirm`,
  submit: "Erase and reset",
} as const;

export function ResetScreen({
  network,
  onBack,
  onReset,
}: {
  network: NetworkId;
  onBack: () => void;
  onReset: () => void;
}) {
  const [typed, setTyped] = useState("");
  const action = useAction();
  const ready = typed === RESET_CONFIRMATION;
  return (
    <SubScreen title={COPY.title} network={network} onBack={onBack} testId="settings-reset">
      <div className="space-y-4">
        <Callout tone="warning">{COPY.warning}</Callout>
        <div className="space-y-1.5">
          <FieldLabel htmlFor="reset-confirm">{COPY.label}</FieldLabel>
          <input
            id="reset-confirm"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="characters"
            value={typed}
            onChange={(e) => {
              setTyped(e.currentTarget.value);
            }}
            className={inputClass(false, "h-10 font-mono tracking-[0.1em]")}
          />
        </div>
        {action.state.kind === "error" && <ErrorText>{errorCopy(action.state.code)}</ErrorText>}
        <Button
          variant="danger"
          className="w-full"
          disabled={!ready}
          busy={action.state.kind === "working"}
          onClick={() =>
            void action
              .run(() => request("RESET_WALLET", { confirmation: RESET_CONFIRMATION }))
              .then((r) => {
                if (r.ok) onReset();
              })
          }
        >
          {COPY.submit}
        </Button>
      </div>
    </SubScreen>
  );
}
