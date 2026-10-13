import type { AccountMeta, WalletStatus } from "@stellix/core";
import { useEffect, useState } from "react";
import { request } from "../../messaging/client.js";
import { GroupedAddress, truncateAddress } from "../components/address.js";
import { Button } from "../components/button.js";
import { ErrorText } from "../components/error-text.js";
import { NetworkBadge } from "../components/network-badge.js";
import { errorCopy } from "../errorCopy.js";
import { useAction } from "../hooks/use-request.js";

// M1 placeholder for the unlocked popup: header (UI_FLOWS §0) with the active account, network
// badge and lock button. The real Home (balances, activity) arrives in M2.

const COPY = {
  lock: "Lock",
  address: "Your address",
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
    <div data-testid="popup" data-screen="unlocked" className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" data-testid="account-label">
            {account?.label ?? ""}
          </p>
          <p className="font-mono text-xs text-muted">
            {account === null ? "" : truncateAddress(account.publicKey)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NetworkBadge network={status.network} />
          <Button
            variant="secondary"
            className="px-3 py-1"
            onClick={() => void lockNow()}
            aria-label={COPY.lock}
          >
            🔒
          </Button>
        </div>
      </header>
      <main className="space-y-3 p-4">
        {state.kind === "error" && <ErrorText>{errorCopy(state.code)}</ErrorText>}
        {account !== null && (
          <section className="space-y-1">
            <h2 className="text-xs uppercase tracking-wide text-muted">{COPY.address}</h2>
            <GroupedAddress address={account.publicKey} />
          </section>
        )}
        <p className="text-sm text-muted">{COPY.comingSoon}</p>
      </main>
    </div>
  );
}
