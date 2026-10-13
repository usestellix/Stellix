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
import { openVaultWithKey } from "../vault/vault.js";
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
