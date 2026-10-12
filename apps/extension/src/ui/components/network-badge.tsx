import type { NetworkId } from "@stellix/core";

const LABELS = { testnet: "TESTNET", mainnet: "MAINNET" } as const satisfies Record<
  NetworkId,
  string
>;

const STYLES = {
  testnet: "bg-testnet-bg text-testnet-fg",
  mainnet: "bg-mainnet-bg text-mainnet-fg",
} as const satisfies Record<NetworkId, string>;

export function NetworkBadge({ network }: { network: NetworkId }) {
  return (
    <span
      data-testid="network-badge"
      className={`rounded px-2 py-0.5 text-xs font-semibold tracking-wide ${STYLES[network]}`}
    >
      {LABELS[network]}
    </span>
  );
}
