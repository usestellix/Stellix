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
} as const;

export const PREPARED_TX_KEY_PREFIX = "preparedTx:";
