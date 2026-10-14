import { z } from "zod";
import { DEFAULT_NETWORK, NETWORK_IDS, type NetworkId } from "./network/config.js";
import type { KeyValueStore } from "./platform.js";
import { PERSISTENT_KEYS } from "./storage-keys.js";

// Settings (ARCHITECTURE §3). Read leniently: each malformed field falls back to its default,
// so a bad value can never brick the wallet.

export const AUTO_LOCK_MINUTES = [5, 15, 30, 60] as const;
export type AutoLockMinutes = (typeof AUTO_LOCK_MINUTES)[number];

export interface Settings {
  network: NetworkId;
  horizonOverrides: Partial<Record<NetworkId, string>>;
  autoLockMinutes: AutoLockMinutes;
}

export const DEFAULT_SETTINGS: Settings = {
  network: DEFAULT_NETWORK,
  horizonOverrides: {},
  autoLockMinutes: 15,
};

const fields = {
  network: z.enum(NETWORK_IDS),
  horizonOverrides: z.partialRecord(z.enum(NETWORK_IDS), z.string()),
  autoLockMinutes: z.union(AUTO_LOCK_MINUTES.map((m) => z.literal(m))),
};

export async function readSettings(store: KeyValueStore): Promise<Settings> {
  const raw = await store.get<unknown>(PERSISTENT_KEYS.settings);
  const obj = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const pick = <K extends keyof Settings>(key: K): Settings[K] => {
    const parsed = fields[key].safeParse(obj[key]);
    return parsed.success ? (parsed.data as Settings[K]) : DEFAULT_SETTINGS[key];
  };
  return {
    network: pick("network"),
    horizonOverrides: pick("horizonOverrides"),
    autoLockMinutes: pick("autoLockMinutes"),
  };
}
