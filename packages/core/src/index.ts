export {
  LABEL_MAX_LENGTH,
  accountMetaSchema,
  defaultAccountLabel,
  normalizeAccountLabel,
  type AccountMeta,
} from "./accounts.js";
export { assertNever } from "./assert-never.js";
export { RESET_CONFIRMATION } from "./constants.js";
export {
  ERROR_CODES,
  StellixError,
  isErrorCode,
  isStellixError,
  toStellixError,
  type ErrorCode,
} from "./errors.js";
export {
  createLogger,
  type LogFields,
  type LogLevel,
  type LogSink,
  type Logger,
  type LoggerOptions,
} from "./log.js";
export {
  assertAccountIndex,
  deriveKeypair,
  derivePublicKey,
  mnemonicToSeed,
} from "./keys/derive.js";
export {
  CREATE_WORD_COUNT,
  IMPORT_WORD_COUNTS,
  MNEMONIC_WORDLIST,
  generateMnemonic,
  isMnemonicWord,
  normalizeMnemonic,
  parseMnemonic,
  unknownWordPositions,
} from "./keys/mnemonic.js";
export { DEFAULT_NETWORK, NETWORK_IDS, isNetworkId, type NetworkId } from "./network/config.js";
export {
  PASSWORD_MIN_LENGTH,
  assertPasswordPolicy,
  meetsPasswordPolicy,
  passwordStrength,
  type PasswordStrength,
} from "./password.js";
export type { KeyValueStore, Platform } from "./platform.js";
export { addAccount, listAccounts, renameAccount, setActiveAccount } from "./services/accounts.js";
export {
  ONBOARDING_TTL_MS,
  VERIFY_WORD_COUNT,
  createWallet,
  importWallet,
  startOnboarding,
  type OnboardingOptions,
  type VerifyAnswer,
} from "./services/onboarding.js";
export { changePassword, resetWallet, revealPhrase } from "./services/secrets.js";
export {
  UNLOCK_LOCKOUT_MS,
  UNLOCK_MAX_FAILURES,
  checkAutoLock,
  isUnlocked,
  lock,
  requireUnlocked,
  touchActivity,
  unlock,
} from "./services/session.js";
export {
  AUTO_LOCK_MINUTES,
  DEFAULT_SETTINGS,
  readSettings,
  type AutoLockMinutes,
  type Settings,
} from "./settings.js";
export { getStatus, type WalletStatus } from "./services/get-status.js";
export { DEFAULT_SCRYPT_PARAMS, SCRYPT_BOUNDS, type ScryptParams } from "./vault/kdf.js";
export type { VaultPlaintext, VaultV1 } from "./vault/schema.js";
export {
  createVault,
  openVault,
  openVaultWithKey,
  parseVault,
  reencryptVault,
  type KeyBytes,
  type VaultWithKey,
} from "./vault/vault.js";
export { PERSISTENT_KEYS, PREPARED_TX_KEY_PREFIX, SESSION_KEYS } from "./storage-keys.js";
