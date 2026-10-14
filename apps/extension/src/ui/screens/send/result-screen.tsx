import { NETWORKS, type NetworkId, type PaymentSummary, type SubmitOutcome } from "@stellix/core";
import { Button } from "../../components/button.js";
import { ErrorText } from "../../components/error-text.js";
import { CheckIcon, ExternalIcon } from "../../components/icons.js";
import { Spinner } from "../../components/spinner.js";
import { SubScreen } from "../../components/sub-screen.js";
import { errorCopy } from "../../errorCopy.js";
import { displayXlm } from "../../lib/xlm.js";

// Result (UI_FLOWS §5.3).

const COPY = {
  title: "Payment",
  sending: "Sending…",
  confirming: "Confirming on the network…",
  confirmingNote:
    "This can take up to 3 minutes. It's safe to close this window; Stellix keeps checking.",
  sent: "Sent",
  failed: "Payment failed",
  hash: "Transaction",
  explorer: "View on explorer",
  done: "Done",
  tryAgain: "Try again",
  edit: "Edit payment",
  sendMax: (x: string) => `Send max (${x} XLM)`,
} as const;

/** Codes where re-preparing with the same inputs is the right next step. */
const RETRYABLE = new Set([
  "FEE_TOO_LOW",
  "TX_EXPIRED_NOT_INCLUDED",
  "PREPARED_TX_EXPIRED",
  "NETWORK_ERROR",
  "RATE_LIMITED",
  "CLOCK_SKEW",
]);

export type ResultState = { kind: "sending" } | { kind: "outcome"; outcome: SubmitOutcome };

export function ResultScreen({
  network,
  summary,
  state,
  onDone,
  onTryAgain,
  onEdit,
  onSendMax,
}: {
  network: NetworkId;
  summary: PaymentSummary;
  state: ResultState;
  onDone: () => void;
  onTryAgain: () => void;
  onEdit: () => void;
  onSendMax: (stroops: bigint) => void;
}) {
  const amount = `${displayXlm(BigInt(summary.amountStroops))} XLM`;
  const pending = state.kind === "sending" || state.outcome.status === "pending";

  return (
    <SubScreen title={COPY.title} network={network} onBack={onDone} testId="send-result">
      <div
        className="flex flex-col items-center gap-4 pt-6 text-center"
        data-testid="result"
        data-status={state.kind === "sending" ? "sending" : state.outcome.status}
      >
        {pending && (
          <>
            <Spinner className="size-6" />
            <p className="text-[15px] font-semibold">
              {state.kind === "sending" ? COPY.sending : COPY.confirming}
            </p>
            {state.kind !== "sending" && (
              <p className="max-w-[36ch] text-[13px] leading-5 text-muted">{COPY.confirmingNote}</p>
            )}
          </>
        )}

        {state.kind === "outcome" && state.outcome.status === "success" && (
          <>
            <div className="flex size-11 items-center justify-center rounded-full bg-fill text-success">
              <CheckIcon size={22} strokeWidth={2} />
            </div>
            <p className="text-[17px] font-semibold">
              {COPY.sent} <span className="tabular">{amount}</span>
            </p>
            <p className="text-[12px] text-muted">
              {COPY.hash}{" "}
              <span className="font-mono" data-testid="result-hash">
                {state.outcome.hash.slice(0, 8)}…{state.outcome.hash.slice(-8)}
              </span>
            </p>
            <a
              href={NETWORKS[network].explorerTxUrl(state.outcome.hash)}
              target="_blank"
              rel="noreferrer"
              className="pressable inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] text-ink-secondary hover-fine:bg-fill"
            >
              {COPY.explorer}
              <ExternalIcon size={13} />
            </a>
          </>
        )}

        {state.kind === "outcome" && state.outcome.status === "failed" && (
          <div className="w-full space-y-3 text-left">
            <p className="text-center text-[15px] font-semibold">{COPY.failed}</p>
            <ErrorText>{errorCopy(state.outcome.error.code)}</ErrorText>
            {state.outcome.error.code === "UNKNOWN_TX_ERROR" &&
              state.outcome.error.details?.resultCode !== undefined && (
                <details className="text-[12px] text-muted">
                  <summary className="cursor-pointer">Details</summary>
                  <code className="font-mono">{state.outcome.error.details.resultCode}</code>
                </details>
              )}
          </div>
        )}
      </div>

      <div className="mt-8 space-y-2">
        {state.kind === "outcome" && state.outcome.status === "failed" && (
          <FailedActions
            outcome={state.outcome}
            onTryAgain={onTryAgain}
            onEdit={onEdit}
            onSendMax={onSendMax}
          />
        )}
        {state.kind === "outcome" && (
          <Button
            variant={state.outcome.status === "failed" ? "secondary" : "primary"}
            className="w-full"
            onClick={onDone}
          >
            {COPY.done}
          </Button>
        )}
      </div>
    </SubScreen>
  );
}

function FailedActions({
  outcome,
  onTryAgain,
  onEdit,
  onSendMax,
}: {
  outcome: Extract<SubmitOutcome, { status: "failed" }>;
  onTryAgain: () => void;
  onEdit: () => void;
  onSendMax: (stroops: bigint) => void;
}) {
  const max = outcome.error.details?.maxSendableStroops;
  if (
    outcome.error.code === "INSUFFICIENT_BALANCE" &&
    max !== undefined &&
    /^\d+$/.test(max) &&
    BigInt(max) > 0n
  ) {
    return (
      <Button
        className="w-full"
        onClick={() => {
          onSendMax(BigInt(max));
        }}
      >
        {COPY.sendMax(displayXlm(BigInt(max)))}
      </Button>
    );
  }
  if (RETRYABLE.has(outcome.error.code)) {
    return (
      <Button className="w-full" onClick={onTryAgain}>
        {COPY.tryAgain}
      </Button>
    );
  }
  return (
    <Button className="w-full" onClick={onEdit}>
      {COPY.edit}
    </Button>
  );
}
