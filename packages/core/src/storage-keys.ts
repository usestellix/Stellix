// Storage map from ARCHITECTURE.md §3. Every key read or written anywhere is listed here.
export const PERSISTENT_KEYS = {
  vault: "vault",
  accounts: "accounts",
  activeAccountIndex: "activeAccountIndex",
  settings: "settings",
  schemaVersion: "schemaVersion",
} as const;

export const SESSION_KEYS = {
  sessionKey: "sessionKey",
  lastActivityAt: "lastActivityAt",
  pendingOnboarding: "pendingOnboarding",
  /** `{ failures, lockedUntil }`. Survives lock; cleared on successful unlock and on browser exit. */
  unlockThrottle: "unlockThrottle",
} as const;

export const PREPARED_TX_KEY_PREFIX = "preparedTx:";
/** In-flight (signed, submitted) transactions. Survive lock; cleared by reset (ADR 0007). */
export const INFLIGHT_KEY_PREFIX = "inflight:";
/** SW-side caches in session storage (fee, base reserve). */
export const SW_CACHE_PREFIX = "sw:";
