import {
  defaultAccountLabel,
  normalizeAccountLabel,
  readAccounts,
  writeAccounts,
  type AccountMeta,
} from "../accounts.js";
import { StellixError } from "../errors.js";
import { derivePublicKey, mnemonicToSeed } from "../keys/derive.js";
import type { Platform } from "../platform.js";
import { PERSISTENT_KEYS } from "../storage-keys.js";
import type { HorizonClient } from "../network/horizon-client.js";
import { openVaultWithKey } from "../vault/vault.js";
import { discoverUsedIndices } from "./discovery.js";
import { derivePublicKeys } from "./onboarding.js";
import { requireUnlocked } from "./session.js";

// Account management (KEY_MANAGEMENT §7.3, ARCHITECTURE §5).

export type AccountsPlatform = Pick<Platform, "persistent" | "session" | "now">;

export function listAccounts(platform: AccountsPlatform): Promise<AccountMeta[]> {
  return readAccounts(platform.persistent);
}

/** Requires unlocked: derives the next index (max + 1) from the vault via the session key. */
export async function addAccount(platform: AccountsPlatform, label?: string): Promise<AccountMeta> {
  const accounts = await readAccounts(platform.persistent);
  const index = accounts.reduce((max, a) => Math.max(max, a.index), -1) + 1;
  const name = label === undefined ? defaultAccountLabel(index) : normalizeAccountLabel(label);

  const key = await requireUnlocked(platform);
  let publicKey: string;
  try {
    const plaintext = await openVaultWithKey(
      await platform.persistent.get<unknown>(PERSISTENT_KEYS.vault),
      key,
    );
    const seed = await mnemonicToSeed(plaintext.mnemonic);
    try {
      publicKey = derivePublicKey(seed, index);
    } finally {
      seed.fill(0);
    }
  } finally {
    key.fill(0);
  }

  const meta: AccountMeta = { index, publicKey, label: name };
  await writeAccounts(platform.persistent, [...accounts, meta]);
  return meta;
}

export async function renameAccount(
  platform: AccountsPlatform,
  index: number,
  label: string,
): Promise<void> {
  const name = normalizeAccountLabel(label);
  const accounts = await readAccounts(platform.persistent);
  if (!accounts.some((a) => a.index === index)) {
    throw new StellixError("INVALID_REQUEST", "No account with that index");
  }
  await writeAccounts(
    platform.persistent,
    accounts.map((a) => (a.index === index ? { ...a, label: name } : a)),
  );
}

export async function setActiveAccount(platform: AccountsPlatform, index: number): Promise<void> {
  const accounts = await readAccounts(platform.persistent);
  if (!accounts.some((a) => a.index === index)) {
    throw new StellixError("INVALID_REQUEST", "No account with that index");
  }
  await platform.persistent.set(PERSISTENT_KEYS.activeAccountIndex, index);
}

/**
 * DISCOVER_ACCOUNTS ("Scan for accounts on this network", UI_FLOWS §8). Requires unlocked.
 * Only appends indices that aren't already listed; never changes existing labels or the
 * active account.
 */
export async function discoverAccounts(
  platform: AccountsPlatform,
  horizon: HorizonClient,
): Promise<{ added: AccountMeta[]; incomplete: boolean }> {
  const key = await requireUnlocked(platform);
  let mnemonic: string;
  try {
    mnemonic = (
      await openVaultWithKey(await platform.persistent.get<unknown>(PERSISTENT_KEYS.vault), key)
    ).mnemonic;
  } finally {
    key.fill(0);
  }
  const result = await discoverUsedIndices((batch) => derivePublicKeys(mnemonic, batch), horizon);

  // Re-read after the (slow) scan; the serial queue in the SW keeps this consistent.
  const existing = await readAccounts(platform.persistent);
  const known = new Set(existing.map((a) => a.index));
  const added: AccountMeta[] = result.indices
    .filter((index) => !known.has(index))
    .map((index) => ({
      index,
      publicKey: result.publicKeys.get(index) ?? "",
      label: defaultAccountLabel(index),
    }));
  if (added.length > 0) {
    await writeAccounts(
      platform.persistent,
      [...existing, ...added].sort((a, b) => a.index - b.index),
    );
  }
  return { added, incomplete: result.incomplete };
}
