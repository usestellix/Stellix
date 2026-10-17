import { NETWORKS, type HistoryItem, type NetworkId } from "@stellix/core";
import { useEffect, useRef, type ReactNode } from "react";
import { GroupedAddress } from "../components/address.js";
import { BigAmount } from "../components/big-amount.js";
import { ErrorText } from "../components/error-text.js";
import { ExternalIcon } from "../components/icons.js";
import { SubScreen } from "../components/sub-screen.js";
import { errorCopy } from "../errorCopy.js";
import { useAction } from "../hooks/use-request.js";
import { activityHeading, feeLabel, memoLabel, signedAmount } from "../lib/activity-copy.js";
import type { HistoryController } from "../lib/history-controller.js";
import { fullTime } from "../lib/time.js";
import { displayXlm } from "../lib/xlm.js";

// Activity detail (UI_FLOWS §7): full addresses, memo, fee (only when this account paid it),
// hash, explorer link. A merge's amount is read from its effects when this opens.

const COPY = {
  from: "From",
  to: "To",
  you: "You",
  recipientId: (id: string) => `Recipient ID ${id}`,
  memo: "Memo",
  date: "Date",
  hash: "Transaction hash",
  explorer: "View on explorer",
  amountLoading: "Loading amount…",
} as const;

export function ActivityDetailScreen({
  item,
  me,
  network,
  controller,
  onBack,
}: {
  item: HistoryItem;
  me: string;
  network: NetworkId;
  controller: HistoryController;
  onBack: () => void;
}) {
  const merge = useAction();
  const requested = useRef(false);
  const { run } = merge;
  useEffect(() => {
    if (item.kind !== "account_merged" || item.amountStroops !== null || requested.current) return;
    requested.current = true;
    void run(() => controller.loadMergeAmount(item.id));
  }, [item, run, controller]);

  const amount = signedAmount(item);
  const incoming = item.direction === "in";
  const fee = item.fee === undefined ? null : feeLabel(item.fee);

  return (
    <SubScreen
      title={activityHeading(item)}
      network={network}
      onBack={onBack}
      testId="activity-detail"
    >
      <div className="space-y-5">
        {amount === null ? (
          <p
            className="text-[28px] font-semibold leading-tight tracking-[-0.02em]"
            data-testid="detail-amount"
          >
            {merge.state.kind === "error" ? (
              "—"
            ) : (
              <span className="text-[15px] font-normal text-muted">{COPY.amountLoading}</span>
            )}
          </p>
        ) : (
          <BigAmount value={amount} testId="detail-amount" className="mt-0" />
        )}
        {merge.state.kind === "error" && <ErrorText>{errorCopy(merge.state.code)}</ErrorText>}

        <dl className="space-y-4">
          <Row label={COPY.from}>
            {incoming ? <GroupedAddress address={item.counterparty} /> : <You me={me} />}
          </Row>
          <Row label={COPY.to}>
            {incoming || item.direction === "self" ? (
              <>
                <You me={me} />
                {item.muxedId !== undefined && (
                  <p className="text-[12px] text-muted">{COPY.recipientId(item.muxedId)}</p>
                )}
              </>
            ) : (
              <GroupedAddress address={item.counterparty} />
            )}
          </Row>
          {item.memo !== undefined && (
            <Row label={COPY.memo}>
              <p className="break-words text-[13px] text-ink" data-testid="detail-memo">
                {memoLabel(item.memo)}
              </p>
            </Row>
          )}
          {fee !== null && item.fee !== undefined && (
            <Row label={fee.label}>
              <p className="tabular text-[13px] text-ink" data-testid="detail-fee">
                {displayXlm(BigInt(item.fee.stroops))} XLM
              </p>
              {fee.note !== null && <p className="text-[12px] text-muted">{fee.note}</p>}
            </Row>
          )}
          <Row label={COPY.date}>
            <p className="text-[13px] text-ink">{fullTime(item.at)}</p>
          </Row>
          <Row label={COPY.hash}>
            <p
              className="break-all font-mono text-[12px] leading-5 text-ink-secondary"
              data-testid="detail-hash"
            >
              {item.hash}
            </p>
          </Row>
        </dl>

        <a
          href={NETWORKS[network].explorerTxUrl(item.hash)}
          target="_blank"
          rel="noopener noreferrer"
          className="pressable inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-ink shadow-ring-strong hover-fine:bg-fill"
        >
          {COPY.explorer}
          <ExternalIcon size={14} />
        </a>
      </div>
    </SubScreen>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">{label}</dt>
      <dd className="space-y-0.5">{children}</dd>
    </div>
  );
}

function You({ me }: { me: string }) {
  return (
    <div className="space-y-0.5">
      <p className="text-[13px] font-medium text-ink">{COPY.you}</p>
      <GroupedAddress address={me} />
    </div>
  );
}
