import {
  addAccount,
  changePassword,
  createWallet,
  getStatus,
  importWallet,
  listAccounts,
  lock,
  renameAccount,
  resetWallet,
  revealPhrase,
  setActiveAccount,
  startOnboarding,
  touchActivity,
  unlock,
  type OnboardingOptions,
  type Platform,
} from "@stellix/core";
import type { Handlers } from "../messaging/router.js";
import { migrate } from "../storage/migrations.js";
import type { AutoLock } from "./autolock.js";
import { createSerialQueue } from "./serial-queue.js";

// Thin handlers: each calls a core service (MOBILE_MIGRATION §4.3), plus the shell's lifecycle
// work (alarms, tabs). Everything except GET_STATUS runs through one serial queue.

export interface HandlerDeps {
  platform: Platform;
  autoLock: AutoLock;
  /** Opens the onboarding page in a new tab (after reset). */
  openOnboarding: () => Promise<void>;
  /** Tests only: lower scrypt N within bounds. */
  onboarding?: OnboardingOptions;
}

/** For handlers with no result: awaits the work and returns `undefined` explicitly. */
async function done(work: Promise<void>): Promise<undefined> {
  await work;
  return undefined;
}

export function createHandlers(deps: HandlerDeps): Handlers {
  const { platform, autoLock } = deps;
  const serial = createSerialQueue();
  const opts = deps.onboarding ?? {};

  /** Unlocking operations end with a running auto-lock alarm. */
  const unlocked = async <T>(result: T): Promise<T> => {
    await autoLock.ensure();
    return result;
  };

  return {
    GET_STATUS: async () => {
      await autoLock.check();
      return getStatus(platform);
    },
    ONBOARD_GENERATE: () => serial(() => startOnboarding(platform)),
    ONBOARD_CREATE: (p) =>
      serial(async () => unlocked({ accounts: await createWallet(platform, p, opts) })),
    ONBOARD_IMPORT: (p) => serial(async () => unlocked(await importWallet(platform, p, opts))),
    UNLOCK: ({ password }) =>
      serial(async () => {
        await unlock(platform, password);
        return unlocked({ ok: true as const });
      }),
    LOCK: () =>
      serial(async () => {
        await lock(platform);
        return done(autoLock.clear());
      }),
    LIST_ACCOUNTS: () => serial(() => listAccounts(platform)),
    ADD_ACCOUNT: ({ label }) => serial(() => addAccount(platform, label)),
    RENAME_ACCOUNT: ({ index, label }) => serial(() => done(renameAccount(platform, index, label))),
    SET_ACTIVE_ACCOUNT: ({ index }) => serial(() => done(setActiveAccount(platform, index))),
    REVEAL_PHRASE: ({ password }) => serial(() => revealPhrase(platform, password)),
    CHANGE_PASSWORD: (p) =>
      serial(async () => {
        await changePassword(platform, p, opts.scryptParams);
        return done(autoLock.ensure());
      }),
    RESET_WALLET: ({ confirmation }) =>
      serial(async () => {
        await resetWallet(platform, confirmation);
        await autoLock.clear();
        await migrate(platform.persistent); // restore schemaVersion on the now-empty store
        return done(deps.openOnboarding());
      }),
  };
}

/**
 * Activity hook for the router (ARCHITECTURE §5 step 4). Checks the idle timeout *before*
 * touching: otherwise any request after the timeout would refresh the clock and dodge auto-lock.
 */
export function createTouchActivity(platform: Platform, autoLock: AutoLock): () => Promise<void> {
  return async () => {
    await autoLock.check();
    await touchActivity(platform);
  };
}
