import {
  NETWORKS,
  fundWithFriendbot,
  type AccountMeta,
  type HorizonClient,
  type InflightView,
  type NetworkId,
} from "@stellix/core";
import { useState } from "react";
import { GroupedAddress, truncateAddress } from "../components/address.js";
import { Button, IconButton } from "../components/button.js";
import { Callout } from "../components/callout.js";
import { ErrorText } from "../components/error-text.js";
import { InflightBanners } from "../components/inflight-banner.js";
import { ChevronDownIcon, GearIcon, InfoIcon, LockIcon, RefreshIcon } from "../components/icons.js";
import { PopupHeader } from "../components/popup-header.js";
import { errorCopy } from "../errorCopy.js";
import { useAccountSummary } from "../hooks/use-account-summary.js";
import { useAction } from "../hooks/use-request.js";
import { asOfTime, displayXlm } from "../lib/xlm.js";

// Home (UI_FLOWS §4). Send/Receive and recent activity arrive in M3/M4; no dead buttons meanwhile.

const COPY = {
  lock: "Lock",
  settings: "Settings",
  accounts: "Switch account",
  total: "Total balance",
  available: "Available",
  reserved: "Reserved",
  reserveInfo: "What's reserved?",
  reserveExplain:
    "Stellar keeps a small amount of XLM locked in every account. You can't send it, but you get it back if you close the account.",
  // UI_FLOWS §4 copy, split into title + detail (the review caught it repeated twice).
  unfundedTitle: "This account isn't active on Stellar yet.",
  unfunded: "Send it at least 1 XLM to activate it.",
  testnetReset: "Testnet was reset. Test accounts are wiped from time to time.",
  friendbot: "Fund with Friendbot",
  friendbotWorking: "Funding",
  friendbotNote: "Friendbot sends free test XLM. It has no value.",
  multisig:
    "This account uses multiple signers. Stellix can show its balance but can't send from it.",
  retry: "Try again",
  asOf: (t: string) => `Last known balance, as of ${t}`,
  address: "Address",
  send: "Send",
} as const;

export function HomeScreen({
  account,
  network,
  horizon,
  onLock,
  onOpenAccounts,
  onOpenSettings,
  inflight,
  onInflightChange,
  onSend,
}: {
  account: AccountMeta;
  network: NetworkId;
  horizon: HorizonClient;
  onLock: () => void;
  onOpenAccounts: () => void;
  onOpenSettings: () => void;
  inflight: readonly InflightView[];
  onInflightChange: () => void;
  /** Receives the available balance; Send is only offered for funded, single-signer accounts. */
  onSend: (availableStroops: bigint) => void;
}) {
  const { state, refresh } = useAccountSummary(account.publicKey, network, horizon);
  const friendbot = useAction();
  const [showReserve, setShowReserve] = useState(false);

  const fund = async () => {
    const result = await friendbot.run(() =>
      fundWithFriendbot(network, account.publicKey, horizon, {
        fetch: globalThis.fetch.bind(globalThis),
      }),
    );
    if (result.ok) refresh();
  };

  return (
    <div data-testid="popup" data-screen="home" className="flex h-full flex-col bg-surface">
      <PopupHeader
        network={network}
        leading={
          <button
            type="button"
            onClick={onOpenAccounts}
            aria-label={COPY.accounts}
            className="pressable -ml-2 flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left hover-fine:bg-fill"
          >
            <span className="min-w-0">
              <span
                className="block truncate text-[14px] font-semibold tracking-[-0.01em]"
                data-testid="account-label"
                title={account.label}
              >
                {account.label}
              </span>
              <span className="block font-mono text-[12px] text-muted" title={account.publicKey}>
                {truncateAddress(account.publicKey)}
              </span>
            </span>
            <ChevronDownIcon size={14} className="shrink-0 text-faint" />
          </button>
        }
        trailing={
          <>
            <IconButton label={COPY.settings} onClick={onOpenSettings}>
              <GearIcon size={16} />
            </IconButton>
            <IconButton label={COPY.lock} onClick={onLock}>
              <LockIcon size={16} />
            </IconButton>
          </>
        }
      />
      <main className="flex-1 space-y-4 overflow-y-auto p-4">
        <InflightBanners
          items={inflight.filter((i) => i.summary.source === account.publicKey)}
          onChange={onInflightChange}
        />
        <section
          className="rounded-xl bg-surface p-4 shadow-raised"
          data-testid="balance-card"
          data-state={state.kind}
        >
          {state.kind === "loading" && <BalanceSkeleton />}

          {state.kind === "funded" && (
            <>
              <p className="text-[12px] text-muted">{COPY.total}</p>
              <p
                className="tabular mt-0.5 text-[28px] font-semibold leading-tight tracking-[-0.02em]"
                data-testid="balance-total"
              >
                {displayXlm(state.summary.totalStroops)}{" "}
                <span className="text-[15px] font-medium text-muted">XLM</span>
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-ink-secondary">
                <span>
                  {COPY.available}:{" "}
                  <span className="tabular font-medium text-ink" data-testid="balance-available">
                    {displayXlm(state.summary.availableStroops)} XLM
                  </span>
                </span>
                <span className="text-faint" aria-hidden="true">
                  ·
                </span>
                <span>
                  {COPY.reserved}:{" "}
                  <span className="tabular" data-testid="balance-reserved">
                    {displayXlm(state.summary.reservedStroops)} XLM
                  </span>
                </span>
                <button
                  type="button"
                  aria-expanded={showReserve}
                  aria-label={COPY.reserveInfo}
                  title={COPY.reserveInfo}
                  onClick={() => {
                    setShowReserve((v) => !v);
                  }}
                  className="pressable inline-flex size-6 items-center justify-center rounded-full text-muted hover-fine:bg-fill hover-fine:text-ink"
                >
                  <InfoIcon size={14} />
                </button>
              </div>
              {showReserve && (
                <p className="mt-2 text-[12px] leading-5 text-muted">{COPY.reserveExplain}</p>
              )}
            </>
          )}

          {state.kind === "unfunded" && (
            <div className="space-y-3">
              <p className="text-[15px] font-semibold tracking-[-0.01em]">{COPY.unfundedTitle}</p>
              {state.wasReset && <Callout tone="warning">{COPY.testnetReset}</Callout>}
              <p className="text-[13px] leading-5 text-muted">{COPY.unfunded}</p>
              {NETWORKS[network].friendbotUrl !== undefined && (
                <div className="space-y-2">
                  <Button
                    className="w-full"
                    busy={friendbot.state.kind === "working"}
                    onClick={() => void fund()}
                  >
                    {friendbot.state.kind === "working" ? COPY.friendbotWorking : COPY.friendbot}
                  </Button>
                  {friendbot.state.kind === "error" ? (
                    <ErrorText>{errorCopy(friendbot.state.code)}</ErrorText>
                  ) : (
                    <p className="text-center text-[12px] text-faint">{COPY.friendbotNote}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {state.kind === "error" && (
            <div className="space-y-3">
              {state.lastKnown !== null && (
                <div className="opacity-60" data-testid="balance-stale">
                  <p className="text-[12px] text-muted">
                    {COPY.asOf(asOfTime(state.lastKnown.at))}
                  </p>
                  <p className="tabular mt-0.5 text-[28px] font-semibold leading-tight tracking-[-0.02em]">
                    {displayXlm(state.lastKnown.totalStroops)}{" "}
                    <span className="text-[15px] font-medium text-muted">XLM</span>
                  </p>
                </div>
              )}
              <ErrorText>{errorCopy(state.code)}</ErrorText>
              <Button variant="secondary" size="sm" onClick={refresh}>
                <RefreshIcon size={14} />
                {COPY.retry}
              </Button>
            </div>
          )}
        </section>

        {state.kind === "funded" && state.summary.multisig && (
          <Callout tone="warning">{COPY.multisig}</Callout>
        )}
        {state.kind === "funded" && !state.summary.multisig && (
          <Button
            className="w-full"
            onClick={() => {
              onSend(state.summary.availableStroops);
            }}
          >
            {COPY.send}
          </Button>
        )}

        <section className="space-y-1.5 px-1">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
            {COPY.address}
          </h2>
          <GroupedAddress address={account.publicKey} />
        </section>
      </main>
    </div>
  );
}

function BalanceSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading balance" className="space-y-2.5">
      <div className="h-3 w-20 rounded bg-fill-strong" />
      <div className="h-7 w-40 rounded bg-fill-strong" />
      <div className="h-3 w-56 rounded bg-fill" />
    </div>
  );
}
