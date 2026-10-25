import { StellixError } from "../errors.js";
import type { NetworkId } from "../network/config.js";
import type { Platform } from "../platform.js";
import { readSettings, type AutoLockMinutes, type Settings } from "../settings.js";
import { PERSISTENT_KEYS } from "../storage-keys.js";

// SET_SETTINGS (UI_FLOWS §9).

export interface SettingsPatch {
  network?: NetworkId;
  /** Required (true) whenever `network` is "mainnet". Enforced here, not just in the UI. */
  acknowledgedRealFunds?: boolean;
  autoLockMinutes?: AutoLockMinutes;
  /** Set (validated URL) or clear (null) the Horizon override for one network. */
  horizonOverride?: { network: NetworkId; url: string | null };
}

export interface SettingsDeps {
  /** Validates and normalizes an override (passphrase probe). Injected so core stays testable. */
  validateHorizonOverride: (url: string, network: NetworkId) => Promise<string>;
  /**
   * Networks this build offers (ADR 0008: a testnet-only build leaves mainnet out). The shell
   * decides; core never reads build flags.
   */
  enabledNetworks: readonly NetworkId[];
}

export async function updateSettings(
  platform: Pick<Platform, "persistent">,
  patch: SettingsPatch,
  deps: SettingsDeps,
): Promise<Settings> {
  for (const network of [patch.network, patch.horizonOverride?.network]) {
    if (network !== undefined && !deps.enabledNetworks.includes(network)) {
      throw new StellixError(
        "INVALID_REQUEST",
        `Network ${network} is not available in this build`,
      );
    }
  }
  if (patch.network === "mainnet" && patch.acknowledgedRealFunds !== true) {
    throw new StellixError(
      "INVALID_REQUEST",
      "Switching to mainnet requires acknowledging real funds",
    );
  }

  const current = await readSettings(platform.persistent);
  const next: Settings = { ...current, horizonOverrides: { ...current.horizonOverrides } };
  if (patch.network !== undefined) next.network = patch.network;
  if (patch.autoLockMinutes !== undefined) next.autoLockMinutes = patch.autoLockMinutes;
  if (patch.horizonOverride !== undefined) {
    const { network, url } = patch.horizonOverride;
    if (url === null) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete -- keyed by a NetworkId union
      delete next.horizonOverrides[network];
    } else {
      next.horizonOverrides[network] = await deps.validateHorizonOverride(url, network);
    }
  }

  await platform.persistent.set(PERSISTENT_KEYS.settings, next);
  return next;
}
