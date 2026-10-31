import { FINDINGS_UI_TEXT, fillTemplate } from "@stellix/core";
import { truncateAddress } from "../../components/address.js";
import { Callout } from "../../components/callout.js";
import { FindingList } from "../../components/findings/finding-list.js";
import { operationLabel } from "../../components/findings/model.js";
import { UnavailableChecks } from "../../components/findings/unavailable-checks.js";
import { AlertIcon } from "../../components/icons.js";
import { displayXlm } from "../../lib/xlm.js";
import { memoText, type AnalyzeView } from "./model.js";

// Mode C report (SHIELD §2, §6.5 Mode C column). Advisory only: it has no action that signs or
// prepares anything. A block shows "Stellix would block this"; reviews show their findings.
// Never "safe" (§1).

const COPY = {
  whatItDoes: "What it does",
  source: "Source account",
  fee: "Network fee bid",
  feeBump: "Fee paid by",
  maxFee: "Most it can be charged",
  memo: "Memo",
} as const;

export function AnalyzeReport({ result }: { result: AnalyzeView }) {
  const { report, transaction } = result;
  const memo = memoText(transaction.memo);
  const rows: [string, string][] = [
    [COPY.source, transaction.source],
    ...(transaction.feeBump === null
      ? ([[COPY.fee, `${displayXlm(BigInt(transaction.feeStroops))} XLM`]] as [string, string][])
      : ([
          [COPY.feeBump, transaction.feeBump.feeSource],
          [COPY.maxFee, `${displayXlm(BigInt(transaction.feeBump.maxFeeStroops))} XLM`],
        ] as [string, string][])),
    ...(memo === null ? [] : ([[COPY.memo, memo]] as [string, string][])),
  ];

  return (
    <div className="space-y-4" data-testid="analyze-report" data-decision={report.decision.state}>
      {report.decision.state === "blocked" && (
        <div
          role="alert"
          data-testid="would-block"
          className="flex gap-2.5 rounded-lg bg-danger-fill px-3.5 py-3 text-danger"
        >
          <AlertIcon size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-[14px] font-semibold">{FINDINGS_UI_TEXT.wouldBlockTitle}</p>
            <p className="mt-1 text-[13px] leading-5">{FINDINGS_UI_TEXT.wouldBlockBody}</p>
          </div>
        </div>
      )}

      <p className="text-[12px] text-muted" data-testid="analyzed-for" title={result.account}>
        {fillTemplate(FINDINGS_UI_TEXT.analyzedFor, {
          account: truncateAddress(result.account),
        })}
      </p>
      {!result.spendsFromAccount && (
        <div data-testid="not-spending">
          <Callout tone="warning">{FINDINGS_UI_TEXT.notSpending}</Callout>
        </div>
      )}

      <FindingList findings={report.findings} />
      <UnavailableChecks checks={report.checksUnavailable} />

      <section aria-labelledby="what-it-does" className="space-y-2">
        <h2
          id="what-it-does"
          className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted"
        >
          {COPY.whatItDoes}
        </h2>
        <ol className="space-y-2" data-testid="analyze-operations">
          {transaction.operations.map((sentences, i) => (
            <li key={i} className="rounded-lg bg-fill px-3 py-2.5">
              <p className="text-[12px] text-muted">{operationLabel(i)}</p>
              {sentences.map((s, j) => (
                <p key={j} className="mt-1 text-[13px] leading-5 [overflow-wrap:anywhere] text-ink">
                  {fillTemplate(s.template, s.values)}
                </p>
              ))}
            </li>
          ))}
        </ol>
        <dl className="divide-y divide-[var(--color-line)] rounded-xl bg-surface px-3 shadow-raised">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-start justify-between gap-3 py-2 text-[13px]">
              <dt className="shrink-0 text-muted">{k}</dt>
              <dd className="min-w-0 text-right font-mono text-[12px] [overflow-wrap:anywhere]">
                {v}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
