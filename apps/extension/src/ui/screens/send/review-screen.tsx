import type { NetworkId, PaymentSummary } from "@stellix/core";
import { useEffect, useState } from "react";
import { GroupedAddress } from "../../components/address.js";
import { Button } from "../../components/button.js";
import { Callout } from "../../components/callout.js";
import { ErrorText } from "../../components/error-text.js";
import { NetworkBadge } from "../../components/network-badge.js";
import { SubScreen } from "../../components/sub-screen.js";
import { errorCopy } from "../../errorCopy.js";
import { displayXlm } from "../../lib/xlm.js";
import type { ErrorCode } from "@stellix/core";

// Review (UI_FLOWS §5.2). Everything shown is from the SW's summary of the BUILT transaction
// (ADR 0003), never from what the user typed.

const COPY = {
  title: "Review",
  type: "Type",
  send: "Send XLM",
  activate: "Activate new account",
  to: "To",
  base: "Base account",
  amount: "Amount",
  memo: "Memo",
  none: "None",
  fee: "Network fee",
  total: "Total",
  firstTime: "You haven't sent to this address before. Check every character.",
  activateWarning: "This address isn't active yet. Sending will activate it — minimum 1 XLM.",
  feeEstimated: "The network fee couldn't be checked, so a safe estimate is used.",
  rebuilt: "Network conditions changed. Please review again.",
  expiresIn: (s: number) =>
    `Expires in ${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, "0")}`,
  expired: "This review expired.",
  cancel: "Cancel",
  confirm: "Confirm and send",
  confirming: "Sending",
  reviewAgain: "Review again",
} as const;

export function ReviewScreen({
  network,
  summary,
  expiresAt,
  rebuilt,
  error,
  busy,
  onCancel,
  onConfirm,
  onReviewAgain,
}: {
  network: NetworkId;
  summary: PaymentSummary;
  expiresAt: number;
  rebuilt: boolean;
  error: ErrorCode | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onReviewAgain: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => {
      setNow(Date.now());
    }, 1_000);
    return () => {
      window.clearInterval(t);
    };
  }, []);
  // The SW refuses confirms within 10 s of maxTime; mirror that so the button never lies.
  const secondsLeft = Math.max(0, Math.floor((expiresAt - 10_000 - now) / 1000));
  // Refused before anything was sent: the prepared tx is gone, so only a new review makes sense.
  const mustReprepare =
    error === "PREPARED_TX_EXPIRED" ||
    error === "PREPARED_TX_NOT_FOUND" ||
    error === "NETWORK_MISMATCH";
  const expired = secondsLeft === 0 || mustReprepare;

  const rows: [string, React.ReactNode][] = [
    [COPY.type, summary.kind === "createAccount" ? COPY.activate : COPY.send],
    [COPY.amount, `${displayXlm(BigInt(summary.amountStroops))} XLM`],
    [
      COPY.memo,
      summary.memo.type === "none"
        ? COPY.none
        : `${summary.memo.value}${summary.memo.type === "id" ? " (ID)" : ""}`,
    ],
    [COPY.fee, `${displayXlm(BigInt(summary.feeStroops))} XLM`],
  ];

  return (
    <SubScreen
      title={COPY.title}
      network={network}
      onBack={onCancel}
      testId="send-review"
      footer={
        <div className="space-y-2">
          {error !== null && <ErrorText>{errorCopy(error)}</ErrorText>}
          <p className="tabular text-center text-[12px] text-muted" data-testid="review-expiry">
            {expired ? COPY.expired : COPY.expiresIn(secondsLeft)}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              {COPY.cancel}
            </Button>
            {expired ? (
              <Button className="flex-1" onClick={onReviewAgain}>
                {COPY.reviewAgain}
              </Button>
            ) : (
              <Button className="flex-1" busy={busy} onClick={onConfirm}>
                {busy ? COPY.confirming : COPY.confirm}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex justify-center" aria-hidden="true">
          <div className="origin-center scale-125">
            <NetworkBadge network={summary.network} />
          </div>
        </div>
        {rebuilt && <Callout>{COPY.rebuilt}</Callout>}
        <section className="space-y-1.5" aria-label={COPY.to}>
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            {COPY.to}
          </h2>
          <div className="rounded-lg bg-fill p-3" data-testid="review-destination">
            <GroupedAddress address={summary.destination} />
          </div>
          {summary.destination !== summary.destinationBase && (
            <p className="text-[12px] text-muted">
              {COPY.base}:{" "}
              <span className="font-mono">
                {summary.destinationBase.slice(0, 4)}…{summary.destinationBase.slice(-4)}
              </span>
            </p>
          )}
        </section>
        <dl
          className="divide-y divide-[var(--color-line)] rounded-xl bg-surface px-3 shadow-raised"
          data-testid="review-rows"
        >
          {rows.map(([k, v]) => (
            <div
              key={k}
              className="flex min-h-10 items-center justify-between gap-3 py-2 text-[13px]"
            >
              <dt className="shrink-0 text-muted">{k}</dt>
              <dd
                className="tabular min-w-0 break-words text-right"
                data-testid={`review-${k.toLowerCase().replaceAll(" ", "-")}`}
              >
                {v}
              </dd>
            </div>
          ))}
          <div className="flex min-h-11 items-center justify-between py-2 text-[14px] font-semibold">
            <dt>{COPY.total}</dt>
            <dd className="tabular" data-testid="review-total">
              {displayXlm(BigInt(summary.totalStroops))} XLM
            </dd>
          </div>
        </dl>
        <div className="space-y-2">
          {summary.kind === "createAccount" && (
            <Callout tone="warning">{COPY.activateWarning}</Callout>
          )}
          {summary.firstTimeDestination && <Callout tone="warning">{COPY.firstTime}</Callout>}
          {summary.feeEstimated && <Callout>{COPY.feeEstimated}</Callout>}
        </div>
      </div>
    </SubScreen>
  );
}
