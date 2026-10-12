import type { WalletStatus } from "@stellix/core";
import { NetworkBadge } from "../components/network-badge.js";
import { errorCopy } from "../errorCopy.js";
import { useStatus } from "../hooks/use-status.js";

// M0 placeholder: shows the GET_STATUS round-trip. Replaced by real routing (UI_FLOWS §1) in M1.

const COPY = {
  title: "Stellix",
  loading: "Loading…",
  retry: "Try again",
  hasVault: "Wallet created",
  unlocked: "Unlocked",
  activeAccount: "Active account",
  none: "None",
  yes: "Yes",
  no: "No",
} as const;

export function StatusScreen() {
  const { state, refresh } = useStatus();

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h1 className="text-base font-semibold">{COPY.title}</h1>
        {state.kind === "ready" && <NetworkBadge network={state.status.network} />}
      </header>
      <main className="flex-1 p-4" data-testid="status" data-state={state.kind}>
        {state.kind === "loading" && <p className="text-muted">{COPY.loading}</p>}
        {state.kind === "error" && (
          <div className="space-y-3">
            <p role="alert">{errorCopy(state.code)}</p>
            <button
              type="button"
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg"
              onClick={refresh}
            >
              {COPY.retry}
            </button>
          </div>
        )}
        {state.kind === "ready" && <StatusTable status={state.status} />}
      </main>
    </div>
  );
}

function StatusTable({ status }: { status: WalletStatus }) {
  const rows: [label: string, value: string, testId: string][] = [
    [COPY.hasVault, status.hasVault ? COPY.yes : COPY.no, "status-has-vault"],
    [COPY.unlocked, status.unlocked ? COPY.yes : COPY.no, "status-unlocked"],
    [
      COPY.activeAccount,
      status.activeAccountIndex === null ? COPY.none : `#${String(status.activeAccountIndex)}`,
      "status-active-account",
    ],
  ];
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-sm">
      {rows.map(([label, value, testId]) => (
        <div key={testId} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd data-testid={testId}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
