import {
  MEMO_TEXT_MAX_BYTES,
  formatXlm,
  isStellixError,
  memoTextBytes,
  minimumStartingBalanceStroops,
  requiresMemo,
  validateDestination,
  type ErrorCode,
  type HorizonClient,
  type NetworkId,
} from "@stellix/core";
import { useRef, useState, type SubmitEvent } from "react";
import { Button } from "../../components/button.js";
import { Callout } from "../../components/callout.js";
import { ErrorText } from "../../components/error-text.js";
import { FieldLabel, inputClass } from "../../components/field.js";
import { ChevronDownIcon } from "../../components/icons.js";
import { SubScreen } from "../../components/sub-screen.js";
import { cx } from "../../cx.js";
import { errorCopy } from "../../errorCopy.js";
import { useFeeEstimate } from "../../hooks/use-fee-estimate.js";
import { displayXlm } from "../../lib/xlm.js";

// Send input (UI_FLOWS §5.1). Fields validate locally on blur for feedback; the SW validates
// everything again in PREPARE_PAYMENT. Not secret: plain controlled inputs are fine here.

export interface SendDraft {
  destination: string;
  amount: string;
  memoType: "text" | "id";
  memo: string;
}

export const EMPTY_DRAFT: SendDraft = { destination: "", amount: "", memoType: "text", memo: "" };

type Field = "destination" | "amount" | "memo" | "general";

/** Which field a prepare error belongs to (TRANSACTIONS §2 codes). */
export function fieldFor(code: ErrorCode): Field {
  switch (code) {
    case "INVALID_ADDRESS":
    case "SECRET_KEY_ENTERED":
    case "SELF_PAYMENT":
    case "MUXED_DESTINATION_UNFUNDED":
      return "destination";
    case "INVALID_AMOUNT":
    case "INSUFFICIENT_BALANCE":
    case "BELOW_MIN_STARTING_BALANCE":
      return "amount";
    case "MEMO_TOO_LONG":
    case "INVALID_MEMO_ID":
    case "MEMO_WITH_MUXED":
    case "MEMO_REQUIRED":
      return "memo";
    default:
      return "general";
  }
}

const COPY = {
  title: "Send XLM",
  to: "To",
  toPlaceholder: "G… or M… address",
  muxedHint: "This address includes a recipient ID — no memo needed.",
  activateHint: "This address isn't active yet. Sending will activate it — minimum 1 XLM.",
  memoRequired: "This recipient requires a memo. Exchanges use it to credit your deposit.",
  amount: "Amount",
  max: "Max",
  available: (x: string) => `Available: ${x} XLM`,
  addMemo: "Add memo",
  memo: "Memo",
  memoText: "Text",
  memoId: "ID",
  bytes: (n: number) => `${String(n)}/${String(MEMO_TEXT_MAX_BYTES)} bytes`,
  tooLittleToActivate: "New accounts need at least 1 XLM, and you don't have enough available.",
  sendMax: (x: string) => `Send max (${x} XLM)`,
  continue: "Continue",
  preparing: "Preparing",
} as const;

export function SendInputScreen({
  network,
  source,
  availableStroops,
  baseReserveStroops,
  horizon,
  draft,
  onDraft,
  error,
  busy,
  onBack,
  onContinue,
}: {
  network: NetworkId;
  source: string;
  availableStroops: bigint;
  /** Live base reserve (STELLAR_PRIMER §4: never assumed). */
  baseReserveStroops: bigint;
  horizon: HorizonClient;
  draft: SendDraft;
  onDraft: (next: SendDraft) => void;
  error: { code: ErrorCode; details?: Readonly<Record<string, string>> } | null;
  busy: boolean;
  onBack: () => void;
  onContinue: (draft: SendDraft) => void;
}) {
  const fee = useFeeEstimate(horizon);
  const [destError, setDestError] = useState<ErrorCode | null>(null);
  const [muxed, setMuxed] = useState(false);
  const [destUnfunded, setDestUnfunded] = useState(false);
  const [memoRequired, setMemoRequired] = useState(false);
  const [memoOpen, setMemoOpen] = useState(draft.memo !== "");
  const lookup = useRef(0);

  const maxSendable =
    fee === null
      ? null
      : availableStroops > fee.feeStroops
        ? availableStroops - fee.feeStroops
        : 0n;
  const cantActivate =
    destUnfunded &&
    maxSendable !== null &&
    maxSendable < minimumStartingBalanceStroops(baseReserveStroops);

  const checkDestination = async () => {
    const value = draft.destination.trim();
    setDestError(null);
    setMuxed(false);
    setDestUnfunded(false);
    setMemoRequired(false);
    if (value === "") return;
    let base: string;
    try {
      const v = validateDestination(value, source);
      base = v.destinationBase;
      setMuxed(v.muxed);
    } catch (err: unknown) {
      setDestError(isStellixError(err) ? err.code : "INVALID_ADDRESS");
      return;
    }
    // Lightweight public lookup (UI_FLOWS §5.1): SEP-29 and activation hints.
    const ticket = ++lookup.current;
    const record = await horizon.getAccount(base).catch(() => undefined);
    if (ticket !== lookup.current || record === undefined) return;
    if (record === null) {
      setDestUnfunded(true);
      return;
    }
    if (!value.startsWith("M") && requiresMemo(record)) {
      setMemoRequired(true);
      setMemoOpen(true);
    }
  };

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    onContinue(draft);
  };

  const field = error === null ? null : fieldFor(error.code);
  const shownDestError =
    destError ?? (field === "destination" && error !== null ? error.code : null);
  const maxFromError =
    error?.code === "INSUFFICIENT_BALANCE" ? error.details?.maxSendableStroops : undefined;
  const bytes = draft.memoType === "text" ? memoTextBytes(draft.memo) : 0;

  return (
    <SubScreen title={COPY.title} network={network} onBack={onBack} testId="send-input">
      <form noValidate onSubmit={submit} className="space-y-5">
        <div className="space-y-1.5">
          <FieldLabel htmlFor="send-to">{COPY.to}</FieldLabel>
          <input
            id="send-to"
            data-testid="send-destination"
            value={draft.destination}
            onChange={(e) => {
              onDraft({ ...draft, destination: e.currentTarget.value });
            }}
            onBlur={() => void checkDestination()}
            placeholder={COPY.toPlaceholder}
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="characters"
            autoFocus
            aria-invalid={shownDestError !== null}
            className={inputClass(shownDestError !== null, "h-10 font-mono text-[12px]")}
          />
          {shownDestError !== null && <ErrorText>{errorCopy(shownDestError)}</ErrorText>}
          {shownDestError === null && muxed && (
            <p className="text-[12px] text-muted">{COPY.muxedHint}</p>
          )}
          {shownDestError === null && destUnfunded && (
            <p className="text-[12px] text-muted">{COPY.activateHint}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-end justify-between">
            <FieldLabel htmlFor="send-amount">{COPY.amount}</FieldLabel>
            <button
              type="button"
              disabled={maxSendable === null || maxSendable === 0n}
              onClick={() => {
                if (maxSendable !== null)
                  onDraft({ ...draft, amount: formatXlm(maxSendable, { trimZeros: true }) });
              }}
              className="pressable rounded-md px-1.5 py-0.5 text-[12px] font-medium text-ink-secondary hover-fine:bg-fill disabled:opacity-40"
            >
              {COPY.max}
            </button>
          </div>
          <div className="relative">
            <input
              id="send-amount"
              data-testid="send-amount"
              inputMode="decimal"
              value={draft.amount}
              onChange={(e) => {
                onDraft({ ...draft, amount: e.currentTarget.value.trim() });
              }}
              placeholder="0"
              autoComplete="off"
              aria-invalid={field === "amount"}
              className={inputClass(field === "amount", "tabular h-10 pr-12 text-[15px]")}
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] text-muted">
              XLM
            </span>
          </div>
          <p className="tabular text-[12px] text-muted">
            {COPY.available(displayXlm(availableStroops))}
          </p>
          {cantActivate && <ErrorText>{COPY.tooLittleToActivate}</ErrorText>}
          {field === "amount" && error !== null && <ErrorText>{errorCopy(error.code)}</ErrorText>}
          {maxFromError !== undefined &&
            /^\d+$/.test(maxFromError) &&
            BigInt(maxFromError) > 0n && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  onContinue({
                    ...draft,
                    amount: formatXlm(BigInt(maxFromError), { trimZeros: true }),
                  });
                }}
              >
                {COPY.sendMax(displayXlm(BigInt(maxFromError)))}
              </Button>
            )}
        </div>

        <div className="space-y-2">
          {!memoOpen ? (
            <button
              type="button"
              disabled={muxed}
              onClick={() => {
                setMemoOpen(true);
              }}
              className="pressable inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[13px] text-ink-secondary hover-fine:bg-fill disabled:opacity-40"
            >
              {COPY.addMemo}
              <ChevronDownIcon size={13} />
            </button>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-end justify-between">
                <FieldLabel htmlFor="send-memo">{COPY.memo}</FieldLabel>
                <div
                  role="radiogroup"
                  aria-label="Memo type"
                  className="inline-flex rounded-md bg-fill p-0.5"
                >
                  {(["text", "id"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={draft.memoType === t}
                      onClick={() => {
                        onDraft({ ...draft, memoType: t });
                      }}
                      className={cx(
                        "h-6 rounded px-2 text-[12px] font-medium",
                        draft.memoType === t
                          ? "bg-surface text-ink shadow-ring-strong"
                          : "text-muted",
                      )}
                    >
                      {t === "text" ? COPY.memoText : COPY.memoId}
                    </button>
                  ))}
                </div>
              </div>
              {memoRequired && <Callout tone="warning">{COPY.memoRequired}</Callout>}
              <input
                id="send-memo"
                data-testid="send-memo"
                value={draft.memo}
                inputMode={draft.memoType === "id" ? "numeric" : "text"}
                onChange={(e) => {
                  onDraft({ ...draft, memo: e.currentTarget.value });
                }}
                autoComplete="off"
                aria-invalid={field === "memo"}
                className={inputClass(field === "memo", "h-10 text-[14px]")}
              />
              {draft.memoType === "text" && (
                <p
                  className={cx(
                    "tabular text-right text-[12px]",
                    bytes > MEMO_TEXT_MAX_BYTES ? "text-danger" : "text-faint",
                  )}
                >
                  {COPY.bytes(bytes)}
                </p>
              )}
              {field === "memo" && error !== null && <ErrorText>{errorCopy(error.code)}</ErrorText>}
            </div>
          )}
        </div>

        {field === "general" && error !== null && <ErrorText>{errorCopy(error.code)}</ErrorText>}
        <Button
          type="submit"
          className="w-full"
          busy={busy}
          disabled={cantActivate || draft.destination.trim() === "" || draft.amount === ""}
        >
          {busy ? COPY.preparing : COPY.continue}
        </Button>
      </form>
    </SubScreen>
  );
}
