import type { NetworkId } from "../network/network-id.js";
import type { Platform } from "../platform.js";
import { readSettings } from "../settings.js";
import { PERSISTENT_KEYS, SESSION_KEYS } from "../storage-keys.js";

export interface WalletStatus {
  hasVault: boolean;
  unlocked: boolean;
  network: NetworkId;
  /** null until the wallet has at least one account. */
  activeAccountIndex: number | null;
}

/**
 * Public wallet state for routing the UI. Only checks whether secret-bearing keys exist;
 * never returns or inspects their contents.
 */
export async function getStatus(
  platform: Pick<Platform, "persistent" | "session">,
): Promise<WalletStatus> {
  const [vault, sessionKey, settings, activeAccountIndex] = await Promise.all([
    platform.persistent.get<unknown>(PERSISTENT_KEYS.vault),
    platform.session.get<unknown>(SESSION_KEYS.sessionKey),
    readSettings(platform.persistent),
    platform.persistent.get<unknown>(PERSISTENT_KEYS.activeAccountIndex),
  ]);

  return {
    hasVault: vault !== undefined,
    unlocked: vault !== undefined && sessionKey !== undefined,
    network: settings.network,
    activeAccountIndex: isAccountIndex(activeAccountIndex) ? activeAccountIndex : null,
  };
}

function isAccountIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
