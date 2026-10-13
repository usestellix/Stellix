import type { NetworkId } from "@stellix/core";
import { cx } from "../cx.js";

// Always visible (CLAUDE.md §6.14). TESTNET neutral-amber, MAINNET red-tinted (UI_FLOWS §0).
// The label carries the meaning; color is reinforcement only.

const LABELS = { testnet: "Testnet", mainnet: "Mainnet" } as const satisfies Record<
  NetworkId,
  string
>;

export function NetworkBadge({ network }: { network: NetworkId }) {
  return (
    <span
      data-testid="network-badge"
      className={cx(
        "inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5",
        "text-[11px] font-semibold uppercase tracking-[0.06em]",
        network === "mainnet" ? "bg-danger-fill text-danger" : "bg-warning-fill text-warning",
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {LABELS[network]}
    </span>
  );
}
