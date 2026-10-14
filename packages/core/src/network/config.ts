// Network configuration (NETWORK.md §1). Horizon URLs are defaults; settings may override them
// per network after a passphrase probe (horizon-url.ts). Mainnet stays gated (CLAUDE.md §6.14).

export const NETWORK_IDS = ["testnet", "mainnet"] as const;

export type NetworkId = (typeof NETWORK_IDS)[number];

export interface NetworkConfig {
  id: NetworkId;
  label: string;
  passphrase: string;
  horizonUrl: string;
  friendbotUrl?: string;
  explorerTxUrl: (hash: string) => string;
  explorerAccountUrl: (id: string) => string;
}

export const NETWORKS: Readonly<Record<NetworkId, NetworkConfig>> = {
  testnet: {
    id: "testnet",
    label: "Testnet",
    passphrase: "Test SDF Network ; September 2015",
    horizonUrl: "https://horizon-testnet.stellar.org",
    friendbotUrl: "https://friendbot.stellar.org",
    explorerTxUrl: (h) => `https://stellar.expert/explorer/testnet/tx/${h}`,
    explorerAccountUrl: (a) => `https://stellar.expert/explorer/testnet/account/${a}`,
  },
  mainnet: {
    id: "mainnet",
    label: "Mainnet",
    passphrase: "Public Global Stellar Network ; September 2015",
    // Default while mainnet is gated; a documented provider is an M5 exit criterion (ADR 0006).
    horizonUrl: "https://horizon.stellar.org",
    explorerTxUrl: (h) => `https://stellar.expert/explorer/public/tx/${h}`,
    explorerAccountUrl: (a) => `https://stellar.expert/explorer/public/account/${a}`,
  },
};

/** Mainnet is off by default (CLAUDE.md §6.14). */
export const DEFAULT_NETWORK: NetworkId = "testnet";

export function isNetworkId(value: unknown): value is NetworkId {
  return typeof value === "string" && (NETWORK_IDS as readonly string[]).includes(value);
}

/** The Horizon URL in effect for a network: the validated override, else the default. */
export function horizonUrlFor(
  network: NetworkId,
  overrides: Partial<Record<NetworkId, string>>,
): string {
  return overrides[network] ?? NETWORKS[network].horizonUrl;
}
