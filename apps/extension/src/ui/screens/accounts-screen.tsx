import {
  isStellixError,
  summarizeAccount,
  getBaseReserveStroops,
  type AccountMeta,
  type HorizonClient,
  type NetworkId,
} from "@stellix/core";
import { useEffect, useMemo, useRef, useState, type SubmitEvent } from "react";
import { request } from "../../messaging/client.js";
import { truncateAddress } from "../components/address.js";
import { Button, IconButton } from "../components/button.js";
import { Callout } from "../components/callout.js";
import { ErrorText } from "../components/error-text.js";
import { inputClass } from "../components/field.js";
import { CheckIcon, PencilIcon, PlusIcon } from "../components/icons.js";
import { SubScreen } from "../components/sub-screen.js";
import { cx } from "../cx.js";
import { errorCopy } from "../errorCopy.js";
import { useAccounts } from "../hooks/use-accounts.js";
import { useAction } from "../hooks/use-request.js";
import { createLimiter } from "../lib/limit.js";
import { UI_PREFIX, uiSessionStore } from "../lib/ui-session.js";
import { displayXlm } from "../lib/xlm.js";

// Accounts (UI_FLOWS §8): list, active marker, switch, rename inline, add, and
// "Scan for accounts on this network". Balances load lazily, at most 2 at a time.

const COPY = {
  title: "Accounts",
  add: "Add account",
  scan: "Scan for accounts on this network",
  scanning: "Scanning",
  rename: (label: string) => `Rename ${label}`,
  save: "Save",
  active: "Active",
  unfunded: "Not active",
  balanceUnavailable: "—",
  found: (n: number) => (n === 1 ? "Found 1 more account." : `Found ${String(n)} more accounts.`),
  none: "No other used accounts found on this network.",
  incomplete: "Couldn't finish checking. Some accounts may be missing; try again later.",
} as const;

export function AccountsScreen({
  network,
  horizon,
  activeIndex,
  onBack,
  onSwitched,
}: {
  network: NetworkId;
  horizon: HorizonClient;
  activeIndex: number | null;
  onBack: () => void;
  onSwitched: () => void;
}) {
  const { accounts, reload } = useAccounts();
  const add = useAction();
  const scan = useAction();
  const [scanResult, setScanResult] = useState<{ added: number; incomplete: boolean } | null>(null);
  const limit = useMemo(() => createLimiter(2), []);

  const switchTo = async (index: number) => {
    if (index !== activeIndex) await request("SET_ACTIVE_ACCOUNT", { index });
    onSwitched();
  };

  return (
    <SubScreen title={COPY.title} network={network} onBack={onBack} testId="accounts">
      <ul className="space-y-1" data-testid="account-list">
        {accounts?.map((a) => (
          <AccountRow
            key={a.index}
            account={a}
            active={a.index === activeIndex}
            network={network}
            horizon={horizon}
            limit={limit}
            onSelect={() => void switchTo(a.index)}
            onRenamed={reload}
          />
        ))}
      </ul>
      <div className="mt-4 space-y-2">
        <Button
          variant="secondary"
          className="w-full"
          busy={add.state.kind === "working"}
          onClick={() =>
            void add
              .run(() => request("ADD_ACCOUNT", {}))
              .then((r) => {
                if (r.ok) reload();
              })
          }
        >
          <PlusIcon size={15} />
          {COPY.add}
        </Button>
        {add.state.kind === "error" && <ErrorText>{errorCopy(add.state.code)}</ErrorText>}
        <Button
          variant="ghost"
          className="w-full"
          busy={scan.state.kind === "working"}
          onClick={() =>
            void scan
              .run(() => request("DISCOVER_ACCOUNTS", undefined))
              .then((r) => {
                if (r.ok) {
                  setScanResult({ added: r.value.added.length, incomplete: r.value.incomplete });
                  reload();
                }
              })
          }
        >
          {scan.state.kind === "working" ? COPY.scanning : COPY.scan}
        </Button>
        {scan.state.kind === "error" && <ErrorText>{errorCopy(scan.state.code)}</ErrorText>}
        {scanResult !== null && (
          <div data-testid="scan-result">
            <Callout tone={scanResult.incomplete ? "warning" : "neutral"}>
              {scanResult.incomplete
                ? COPY.incomplete
                : scanResult.added > 0
                  ? COPY.found(scanResult.added)
                  : COPY.none}
            </Callout>
          </div>
        )}
      </div>
    </SubScreen>
  );
}

function AccountRow({
  account,
  active,
  network,
  horizon,
  limit,
  onSelect,
  onRenamed,
}: {
  account: AccountMeta;
  active: boolean;
  network: NetworkId;
  horizon: HorizonClient;
  limit: <T>(task: () => Promise<T>) => Promise<T>;
  onSelect: () => void;
  onRenamed: () => void;
}) {
  const [balance, setBalance] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const rename = useAction();

  useEffect(() => {
    let current = true;
    void limit(async () => {
      const store = uiSessionStore();
      const [record, reserve] = await Promise.all([
        horizon.getAccount(account.publicKey),
        getBaseReserveStroops(network, horizon, { store, prefix: UI_PREFIX }),
      ]);
      const summary = summarizeAccount(record, reserve);
      return summary.funded ? `${displayXlm(summary.totalStroops)} XLM` : COPY.unfunded;
    }).then(
      (text) => {
        if (current) setBalance(text);
      },
      (err: unknown) => {
        if (current)
          setBalance(isStellixError(err) ? COPY.balanceUnavailable : COPY.balanceUnavailable);
      },
    );
    return () => {
      current = false;
    };
  }, [account.publicKey, network, horizon, limit]);

  const save = async (event: SubmitEvent) => {
    event.preventDefault();
    const label = inputRef.current?.value ?? "";
    const result = await rename.run(() =>
      request("RENAME_ACCOUNT", { index: account.index, label }),
    );
    if (result.ok) {
      setEditing(false);
      onRenamed();
    }
  };

  if (editing) {
    return (
      <li className="rounded-lg bg-fill p-2">
        <form onSubmit={(e) => void save(e)} className="flex items-center gap-2">
          <input
            ref={inputRef}
            defaultValue={account.label}
            maxLength={32}
            autoFocus
            aria-label={COPY.rename(account.label)}
            className={inputClass(rename.state.kind === "error", "h-9 text-[14px]")}
          />
          <Button type="submit" size="sm" busy={rename.state.kind === "working"}>
            {COPY.save}
          </Button>
        </form>
        {rename.state.kind === "error" && (
          <div className="mt-1.5">
            <ErrorText>{errorCopy(rename.state.code)}</ErrorText>
          </div>
        )}
      </li>
    );
  }

  return (
    <li className="flex items-center gap-1" data-testid={`account-row-${String(account.index)}`}>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active || undefined}
        className={cx(
          "pressable flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left",
          active ? "bg-fill" : "hover-fine:bg-fill",
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-medium" title={account.label}>
              {account.label}
            </span>
            {active && (
              <CheckIcon size={14} className="shrink-0 text-ink" aria-label={COPY.active} />
            )}
          </span>
          <span className="block font-mono text-[12px] text-muted">
            {truncateAddress(account.publicKey)}
          </span>
        </span>
        <span
          className="tabular shrink-0 text-right text-[13px] text-ink-secondary"
          data-testid="account-balance"
        >
          {balance ?? (
            <span className="inline-block h-3 w-14 rounded bg-fill-strong align-middle" />
          )}
        </span>
      </button>
      <IconButton
        label={COPY.rename(account.label)}
        onClick={() => {
          setEditing(true);
        }}
      >
        <PencilIcon size={14} />
      </IconButton>
    </li>
  );
}
