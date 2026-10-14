import type { NetworkId, Settings } from "@stellix/core";
import { useRef, useState } from "react";
import { request } from "../../../messaging/client.js";
import { Button } from "../../components/button.js";
import { ErrorText } from "../../components/error-text.js";
import { CheckIcon } from "../../components/icons.js";
import { SubScreen } from "../../components/sub-screen.js";
import { cx } from "../../cx.js";
import { errorCopy } from "../../errorCopy.js";
import { useAction } from "../../hooks/use-request.js";

// Network (UI_FLOWS §9, CLAUDE.md §6.14). Mainnet needs an explicit confirmation here AND
// acknowledgedRealFunds: true, which the SW enforces independently.

const COPY = {
  title: "Network",
  testnet: { name: "Testnet", hint: "Test XLM with no value. Fund accounts free with Friendbot." },
  mainnet: { name: "Mainnet", hint: "The real Stellar network. Real XLM, real money." },
  dialogTitle: "Switch to Mainnet?",
  dialogBody: "On Mainnet you send and receive real XLM. Transactions can't be reversed.",
  acknowledge: "I understand this uses real XLM",
  confirm: "Switch",
  cancel: "Cancel",
} as const;

export function NetworkSettings({
  settings,
  onBack,
  onChanged,
}: {
  settings: Settings;
  onBack: () => void;
  onChanged: (next: Settings) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const action = useAction();

  const apply = async (network: NetworkId) => {
    const result = await action.run(() =>
      request(
        "SET_SETTINGS",
        network === "mainnet" ? { network, acknowledgedRealFunds: true } : { network },
      ),
    );
    if (result.ok) {
      dialogRef.current?.close();
      onChanged(result.value);
    }
  };

  const choose = (network: NetworkId) => {
    if (network === settings.network) return;
    if (network === "mainnet") {
      setAcknowledged(false);
      dialogRef.current?.showModal();
      return;
    }
    void apply("testnet");
  };

  return (
    <SubScreen
      title={COPY.title}
      network={settings.network}
      onBack={onBack}
      testId="settings-network"
    >
      <div role="radiogroup" aria-label={COPY.title} className="space-y-2">
        {(["testnet", "mainnet"] as const).map((id) => {
          const selected = settings.network === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => {
                choose(id);
              }}
              className={cx(
                "pressable flex w-full items-start gap-3 rounded-xl p-3.5 text-left",
                selected
                  ? "bg-surface shadow-[0_0_0_1.5px_var(--color-ink)]"
                  : "bg-surface shadow-raised hover-fine:bg-fill",
              )}
            >
              <span className="flex-1">
                <span className="block text-[14px] font-semibold">{COPY[id].name}</span>
                <span className="mt-0.5 block text-[12px] leading-5 text-muted">
                  {COPY[id].hint}
                </span>
              </span>
              {selected && <CheckIcon size={16} className="mt-0.5 shrink-0" />}
            </button>
          );
        })}
      </div>
      {action.state.kind === "error" && (
        <div className="mt-3">
          <ErrorText>{errorCopy(action.state.code)}</ErrorText>
        </div>
      )}

      {/* Native <dialog>: focus trap, Esc to close, top layer. No library needed. */}
      <dialog
        ref={dialogRef}
        aria-labelledby="mainnet-dialog-title"
        data-testid="mainnet-dialog"
        className="m-auto w-[312px] rounded-2xl bg-surface p-5 text-ink shadow-raised backdrop:bg-black/40"
      >
        <h2 id="mainnet-dialog-title" className="text-[17px] font-semibold tracking-[-0.01em]">
          {COPY.dialogTitle}
        </h2>
        <p className="mt-2 text-[13px] leading-5 text-muted">{COPY.dialogBody}</p>
        <label className="mt-4 flex cursor-pointer items-start gap-2.5 rounded-lg bg-danger-fill p-3 text-[13px] leading-5 text-danger">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => {
              setAcknowledged(e.currentTarget.checked);
            }}
            className="mt-0.5 size-4 shrink-0 accent-[var(--color-danger)]"
          />
          {COPY.acknowledge}
        </label>
        <div className="mt-5 flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => {
              dialogRef.current?.close();
            }}
          >
            {COPY.cancel}
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            disabled={!acknowledged}
            busy={action.state.kind === "working"}
            onClick={() => void apply("mainnet")}
          >
            {COPY.confirm}
          </Button>
        </div>
      </dialog>
    </SubScreen>
  );
}
