import { NETWORK_IDS, type NetworkId } from "@stellix/core";

// Build-time flags (wxt.config.ts `define`). Read only here, so the rest of the shell and all
// of core receive plain values.

/** ADR 0008: false for the first public release (testnet only). */
export const MAINNET_ENABLED: boolean = __STELLIX_MAINNET_ENABLED__;

export const ENABLED_NETWORKS: readonly NetworkId[] = MAINNET_ENABLED
  ? NETWORK_IDS
  : (["testnet"] as const);
