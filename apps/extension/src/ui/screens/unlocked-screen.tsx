import type { AccountMeta, WalletStatus } from "@stellix/core";
import { useEffect, useState } from "react";
import { request } from "../../messaging/client.js";
import { GroupedAddress, truncateAddress } from "../components/address.js";
import { IconButton } from "../components/button.js";
import { ErrorText } from "../components/error-text.js";
import { LockIcon } from "../components/icons.js";
import { PopupHeader } from "../components/popup-header.js";
import { errorCopy } from "../errorCopy.js";
import { useAction } from "../hooks/use-request.js";

// M1 placeholder for the unlocked popup: header (UI_FLOWS §0) with the active account, network
// badge and lock button. The real Home (balances, activity) arrives in M2.

const COPY = {
  lock: "Lock",
  address: "Address",
  comingSoon: "Balances and activity arrive in the next update.",
} as const;

export function UnlockedScreen({
  status,
  onLocked,
}: {
  status: WalletStatus;
  onLocked: () => void;
}) {
  const [account, setAccount] = useState<AccountMeta | null>(null);
  const { state, run } = useAction();

  useEffect(() => {
    let current = true;
    void request("LIST_ACCOUNTS", undefined).then(
      (accounts) => {
        if (current)
          setAccount(accounts.find((a) => a.index === status.activeAccountIndex) ?? null);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [status.activeAccountIndex]);

  const lockNow = async () => {
    if ((await run(() => request("LOCK", undefined))).ok) onLocked();
  };

  return (
    <div data-testid="popup" data-screen="unlocked" className="flex h-full flex-col bg-surface">
      <PopupHeader
        network={status.network}
        leading={
          <div className="min-w-0">
            <p
              className="truncate text-[14px] font-semibold tracking-[-0.01em]"
              data-testid="account-label"
              title={account?.label}
            >
              {account?.label ?? " "}
            </p>
            <p className="font-mono text-[12px] text-muted" title={account?.publicKey}>
              {account === null ? " " : truncateAddress(account.publicKey)}
            </p>
          </div>
        }
        trailing={
          <IconButton label={COPY.lock} onClick={() => void lockNow()}>
            <LockIcon size={16} />
          </IconButton>
        }
      />
      <main className="space-y-4 p-4">
        {state.kind === "error" && <ErrorText>{errorCopy(state.code)}</ErrorText>}
        {account !== null && (
          <section className="space-y-2 rounded-xl bg-surface p-4 shadow-raised">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
              {COPY.address}
            </h2>
            <GroupedAddress address={account.publicKey} />
          </section>
        )}
        <p className="px-1 text-[13px] text-faint">{COPY.comingSoon}</p>
      </main>
    </div>
  );
}
