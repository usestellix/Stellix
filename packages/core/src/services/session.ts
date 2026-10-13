import { StellixError } from "../errors.js";
import type { Platform } from "../platform.js";
import { readSettings } from "../settings.js";
import { PERSISTENT_KEYS, PREPARED_TX_KEY_PREFIX, SESSION_KEYS } from "../storage-keys.js";
import { fromBase64, toBase64 } from "../vault/encoding.js";
import { openVault, type KeyBytes } from "../vault/vault.js";

// Unlocked session (KEY_MANAGEMENT §6, ARCHITECTURE §6.1/§6.3). All state lives in session
// storage so it survives service-worker termination.

export type SessionPlatform = Pick<Platform, "persistent" | "session" | "now">;

export const UNLOCK_MAX_FAILURES = 5;
export const UNLOCK_LOCKOUT_MS = 30_000;

interface UnlockThrottle {
  failures: number;
  lockedUntil: number | null;
}

/** Writes the session key (base64) and starts the activity clock. Caller still owns `key`. */
export async function startSession(platform: SessionPlatform, key: KeyBytes): Promise<void> {
  await platform.session.set(SESSION_KEYS.sessionKey, toBase64(key));
  await platform.session.set(SESSION_KEYS.lastActivityAt, platform.now());
}

/**
 * KEY_MANAGEMENT §6 Lock: removes sessionKey, lastActivityAt, pendingOnboarding and every
 * preparedTx:* key. The shell clears the auto-lock alarm. The unlock throttle is kept.
 */
export async function lock(platform: SessionPlatform): Promise<void> {
  const prepared = (await platform.session.keys()).filter((k) =>
    k.startsWith(PREPARED_TX_KEY_PREFIX),
  );
  for (const key of [
    SESSION_KEYS.sessionKey,
    SESSION_KEYS.lastActivityAt,
    SESSION_KEYS.pendingOnboarding,
    ...prepared,
  ]) {
    await platform.session.remove(key);
  }
}

export async function isUnlocked(platform: SessionPlatform): Promise<boolean> {
  return (await platform.session.get<unknown>(SESSION_KEYS.sessionKey)) !== undefined;
}

/** Locks if the idle timeout has passed. Returns true if it locked. */
export async function checkAutoLock(platform: SessionPlatform): Promise<boolean> {
  if (!(await isUnlocked(platform))) return false;
  const [lastActivityAt, settings] = await Promise.all([
    platform.session.get<unknown>(SESSION_KEYS.lastActivityAt),
    readSettings(platform.persistent),
  ]);
  const idleMs = typeof lastActivityAt === "number" ? platform.now() - lastActivityAt : Infinity;
  if (idleMs <= settings.autoLockMinutes * 60_000) return false;
  await lock(platform);
  return true;
}

/** Records user activity (ARCHITECTURE §5 step 4). No-op while locked. */
export async function touchActivity(platform: SessionPlatform): Promise<void> {
  if (await isUnlocked(platform)) {
    await platform.session.set(SESSION_KEYS.lastActivityAt, platform.now());
  }
}

/**
 * Returns the session key for an operation that requires the unlocked state. Re-checks the idle
 * timeout first, so an expired session is locked even if the alarm hasn't fired yet.
 * The caller must `.fill(0)` the returned buffer.
 */
export async function requireUnlocked(platform: SessionPlatform): Promise<KeyBytes> {
  await checkAutoLock(platform);
  const stored = await platform.session.get<unknown>(SESSION_KEYS.sessionKey);
  if (typeof stored !== "string") throw new StellixError("LOCKED", "Wallet is locked");
  try {
    return fromBase64(stored);
  } catch {
    await lock(platform);
    throw new StellixError("LOCKED", "Session key is unreadable");
  }
}

/**
 * Password check with brute-force throttling enforced here, in the SW, not in the UI: after
 * 5 consecutive wrong passwords, every attempt is refused for 30 s (UNLOCK_THROTTLED).
 * Used by UNLOCK and the re-auth flows (reveal phrase, change password).
 */
export async function verifyPassword(
  platform: SessionPlatform,
  password: string,
): Promise<Awaited<ReturnType<typeof openVault>>> {
  const throttle = await readThrottle(platform);
  if (throttle.lockedUntil !== null && platform.now() < throttle.lockedUntil) {
    throw new StellixError("UNLOCK_THROTTLED", "Too many failed attempts");
  }

  const vault = await platform.persistent.get<unknown>(PERSISTENT_KEYS.vault);
  try {
    const opened = await openVault(vault, password);
    await platform.session.remove(SESSION_KEYS.unlockThrottle);
    return opened;
  } catch (err: unknown) {
    if (err instanceof StellixError && err.code === "INVALID_PASSWORD") {
      const failures = (throttle.lockedUntil === null ? throttle.failures : 0) + 1;
      const next: UnlockThrottle =
        failures >= UNLOCK_MAX_FAILURES
          ? { failures: 0, lockedUntil: platform.now() + UNLOCK_LOCKOUT_MS }
          : { failures, lockedUntil: null };
      await platform.session.set(SESSION_KEYS.unlockThrottle, next);
    }
    throw err;
  }
}

/** UNLOCK (ARCHITECTURE §6.1). */
export async function unlock(platform: SessionPlatform, password: string): Promise<void> {
  const { key } = await verifyPassword(platform, password);
  try {
    await startSession(platform, key);
  } finally {
    key.fill(0);
  }
}

async function readThrottle(platform: SessionPlatform): Promise<UnlockThrottle> {
  const raw = await platform.session.get<unknown>(SESSION_KEYS.unlockThrottle);
  if (typeof raw === "object" && raw !== null && "failures" in raw && "lockedUntil" in raw) {
    const { failures, lockedUntil } = raw;
    if (typeof failures === "number" && (lockedUntil === null || typeof lockedUntil === "number")) {
      return { failures, lockedUntil };
    }
  }
  return { failures: 0, lockedUntil: null };
}
