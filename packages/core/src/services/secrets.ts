import { RESET_CONFIRMATION } from "../constants.js";
import { StellixError } from "../errors.js";
import { assertPasswordPolicy } from "../password.js";
import type { Platform } from "../platform.js";
import { PERSISTENT_KEYS } from "../storage-keys.js";
import { DEFAULT_SCRYPT_PARAMS, type ScryptParams } from "../vault/kdf.js";
import { reencryptVault } from "../vault/vault.js";
import { requireUnlocked, startSession, verifyPassword } from "./session.js";

// Re-authenticated operations (KEY_MANAGEMENT §6 Re-authentication, §7.4–7.6).

export type SecretsPlatform = Pick<Platform, "persistent" | "session" | "now">;

/**
 * REVEAL_PHRASE: requires unlocked AND the password again, with the same throttle as unlock.
 * Returns the words for one-time display on the onboarding page.
 */
export async function revealPhrase(
  platform: SecretsPlatform,
  password: string,
): Promise<{ words: string[] }> {
  const sessionKey = await requireUnlocked(platform);
  sessionKey.fill(0);
  const { plaintext, key } = await verifyPassword(platform, password);
  key.fill(0);
  return { words: plaintext.mnemonic.split(" ") };
}

/**
 * CHANGE_PASSWORD (§7.5): re-encrypts with a fresh salt/IV, writes the vault only after
 * re-encryption succeeded, then replaces the session key.
 */
export async function changePassword(
  platform: SecretsPlatform,
  input: { current: string; next: string },
  scryptParams: ScryptParams = DEFAULT_SCRYPT_PARAMS,
): Promise<void> {
  const sessionKey = await requireUnlocked(platform);
  sessionKey.fill(0);
  assertPasswordPolicy(input.next);
  const opened = await verifyPassword(platform, input.current);
  opened.key.fill(0);
  const { vault, key } = await reencryptVault(opened.plaintext, input.next, scryptParams);
  try {
    await platform.persistent.set(PERSISTENT_KEYS.vault, vault);
    await startSession(platform, key);
  } finally {
    key.fill(0);
  }
}

/** RESET_WALLET (§7.6): wipes all persistent and session storage. The shell clears alarms. */
export async function resetWallet(platform: SecretsPlatform, confirmation: string): Promise<void> {
  if (confirmation !== RESET_CONFIRMATION) {
    throw new StellixError("INVALID_REQUEST", "Reset not confirmed");
  }
  await platform.session.clear();
  await platform.persistent.clear();
}
