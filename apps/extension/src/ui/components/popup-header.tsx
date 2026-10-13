import type { NetworkId } from "@stellix/core";
import type { ReactNode } from "react";
import { NetworkBadge } from "./network-badge.js";

/** Popup chrome (UI_FLOWS §0): identity on the left, network badge always on the right. */
export function PopupHeader({
  network,
  leading,
  trailing,
}: {
  network: NetworkId | null;
  leading: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 px-4 shadow-[0_1px_0_var(--color-line)]">
      <div className="min-w-0 flex-1">{leading}</div>
      <div className="flex shrink-0 items-center gap-1.5">
        {network !== null && <NetworkBadge network={network} />}
        {trailing}
      </div>
    </header>
  );
}
