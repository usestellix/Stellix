// Minimal M0 slice of NETWORK.md §1. Full NetworkConfig / NETWORKS arrive in M2.
export const NETWORK_IDS = ["testnet", "mainnet"] as const;

export type NetworkId = (typeof NETWORK_IDS)[number];

/** Mainnet is off by default (CLAUDE.md §6.14). */
export const DEFAULT_NETWORK: NetworkId = "testnet";

export function isNetworkId(value: unknown): value is NetworkId {
  return typeof value === "string" && (NETWORK_IDS as readonly string[]).includes(value);
}
