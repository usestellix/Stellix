import {
  formatXlm,
  getBaseReserveStroops,
  isStellixError,
  type ErrorCode,
  type HorizonClient,
  type NetworkId,
  type PaymentSummary,
} from "@stellix/core";
import { useEffect, useState } from "react";
import { request } from "../../../messaging/client.js";
import { UI_PREFIX, uiSessionStore } from "../../lib/ui-session.js";
import { ResultScreen, type ResultState } from "./result-screen.js";
import { ReviewScreen } from "./review-screen.js";
import { EMPTY_DRAFT, SendInputScreen, type SendDraft } from "./send-input-screen.js";

// Send flow (TRANSACTIONS §1). The popup renders states; the SW owns transitions that involve
// the network or secrets. Nothing here is secret: drafts are public payment details.

type Step =
  | {
      kind: "input";
      error: { code: ErrorCode; details?: Readonly<Record<string, string>> } | null;
      busy: boolean;
    }
  | {
      kind: "review";
      preparedId: string;
      summary: PaymentSummary;
      expiresAt: number;
      rebuilt: boolean;
      error: ErrorCode | null;
      busy: boolean;
    }
  | { kind: "result"; summary: PaymentSummary; state: ResultState };

export function SendFlow({
  network,
  source,
  availableStroops,
  horizon,
  onClose,
}: {
  network: NetworkId;
  source: string;
  availableStroops: bigint;
  horizon: HorizonClient;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<SendDraft>(EMPTY_DRAFT);
  const [step, setStep] = useState<Step>({ kind: "input", error: null, busy: false });
  const [reserve, setReserve] = useState<bigint>(5_000_000n);

  useEffect(() => {
    let current = true;
    void getBaseReserveStroops(network, horizon, {
      store: uiSessionStore(),
      prefix: UI_PREFIX,
    }).then((r) => {
      if (current) setReserve(r);
    });
    return () => {
      current = false;
    };
  }, [network, horizon]);

  const prepare = async (d: SendDraft, rebuilt = false) => {
    setStep({ kind: "input", error: null, busy: true });
    const memo = d.memo === "" ? undefined : { type: d.memoType, value: d.memo };
    try {
      const res = await request("PREPARE_PAYMENT", {
        destination: d.destination.trim(),
        amount: d.amount,
        ...(memo ? { memo } : {}),
      });
      setStep({
        kind: "review",
        preparedId: res.preparedId,
        summary: res.summary,
        expiresAt: res.expiresAt,
        rebuilt,
        error: null,
        busy: false,
      });
    } catch (err: unknown) {
      const code = isStellixError(err) ? err.code : "INTERNAL_ERROR";
      const details = isStellixError(err) ? err.details : undefined;
      setStep({ kind: "input", error: details ? { code, details } : { code }, busy: false });
    }
  };

  const cancel = async (preparedId: string) => {
    await request("CANCEL_PAYMENT", { preparedId }).catch(() => undefined);
    setStep({ kind: "input", error: null, busy: false });
  };

  const confirm = async (review: Extract<Step, { kind: "review" }>) => {
    setStep({ ...review, busy: true });
    try {
      const outcome = await request("CONFIRM_PAYMENT", { preparedId: review.preparedId });
      if (outcome.status === "rebuild") {
        await prepare(draft, true); // UI_FLOWS §5.3: auto re-prepare, back to review with a note
        return;
      }
      setStep({ kind: "result", summary: review.summary, state: { kind: "outcome", outcome } });
    } catch (err: unknown) {
      // Rejected before submitting (e.g. expired, network changed): nothing was sent.
      setStep({ ...review, busy: false, error: isStellixError(err) ? err.code : "INTERNAL_ERROR" });
    }
  };

  // While "pending", follow the SW's resolution via GET_STATUS.
  const pendingHash =
    step.kind === "result" &&
    step.state.kind === "outcome" &&
    step.state.outcome.status === "pending"
      ? step.state.outcome.hash
      : null;
  useEffect(() => {
    if (pendingHash === null) return;
    const t = window.setInterval(() => {
      void request("GET_STATUS", undefined).then(
        (s) => {
          const tx = s.inflight.find((i) => i.hash === pendingHash);
          if (tx?.outcome != null) {
            setStep((prev) =>
              prev.kind === "result"
                ? {
                    ...prev,
                    state: {
                      kind: "outcome",
                      outcome: tx.outcome as NonNullable<typeof tx.outcome>,
                    },
                  }
                : prev,
            );
          }
        },
        () => undefined,
      );
    }, 3_000);
    return () => {
      window.clearInterval(t);
    };
  }, [pendingHash]);

  const finish = async () => {
    if (step.kind === "result" && step.state.kind === "outcome") {
      const o = step.state.outcome;
      if (o.status !== "rebuild" && o.status !== "pending")
        await request("DISMISS_OUTCOME", { hash: o.hash }).catch(() => undefined);
    }
    onClose();
  };

  switch (step.kind) {
    case "input":
      return (
        <SendInputScreen
          network={network}
          source={source}
          availableStroops={availableStroops}
          baseReserveStroops={reserve}
          horizon={horizon}
          draft={draft}
          onDraft={setDraft}
          error={step.error}
          busy={step.busy}
          onBack={onClose}
          onContinue={(d) => {
            setDraft(d);
            void prepare(d);
          }}
        />
      );
    case "review":
      return (
        <ReviewScreen
          network={network}
          summary={step.summary}
          expiresAt={step.expiresAt}
          rebuilt={step.rebuilt}
          error={step.error}
          busy={step.busy}
          onCancel={() => void cancel(step.preparedId)}
          onConfirm={() => void confirm(step)}
          onReviewAgain={() => void prepare(draft)}
        />
      );
    case "result":
      return (
        <ResultScreen
          network={network}
          summary={step.summary}
          state={step.state}
          onDone={() => void finish()}
          onTryAgain={() => void prepare(draft)}
          onEdit={() => {
            setStep({ kind: "input", error: null, busy: false });
          }}
          onSendMax={(stroops) => {
            const d = { ...draft, amount: formatXlm(stroops, { trimZeros: true }) };
            setDraft(d);
            void prepare(d);
          }}
        />
      );
  }
}
