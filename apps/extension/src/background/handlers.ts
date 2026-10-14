import {
  addAccount,
  changePassword,
  createHorizonClient,
  discoverAccounts,
  horizonUrlFor,
  readSettings,
  updateSettings,
  validateHorizonOverride,
  type HorizonClient,
  type SettingsPatch,
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
  /** Dev builds may point a network at http://localhost Horizon (NETWORK.md §1). */
  devBuild: boolean;
  /** Tests inject a fake; production builds a client for the network's effective URL. */
  horizonFor?: (url: string) => HorizonClient;
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
  const makeClient = deps.horizonFor ?? ((url: string) => createHorizonClient(url, platform));

  /** Horizon for the currently selected network, honouring a validated override. */
  const currentHorizon = async (): Promise<HorizonClient> => {
    const settings = await readSettings(platform.persistent);
    return makeClient(horizonUrlFor(settings.network, settings.horizonOverrides));
  };

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
    ONBOARD_IMPORT: (p) =>
      serial(async () =>
        unlocked(await importWallet(platform, p, { ...opts, horizon: await currentHorizon() })),
      ),
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
    GET_SETTINGS: () => readSettings(platform.persistent),
    SET_SETTINGS: (payload) =>
      serial(() =>
        updateSettings(platform, toSettingsPatch(payload), {
          validateHorizonOverride: (url, network) =>
            validateHorizonOverride(url, network, { allowLocalhost: deps.devBuild }, platform),
        }),
      ),
    DISCOVER_ACCOUNTS: () => serial(async () => discoverAccounts(platform, await currentHorizon())),
    RESET_WALLET: ({ confirmation }) =>
      serial(async () => {
        await resetWallet(platform, confirmation);
        await autoLock.clear();
        await migrate(platform.persistent); // restore schemaVersion on the now-empty store
        return done(deps.openOnboarding());
      }),
  };
}

/** Drops undefined keys: core's SettingsPatch uses exact optional properties. */
function toSettingsPatch(payload: {
  network?: SettingsPatch["network"] | undefined;
  acknowledgedRealFunds?: boolean | undefined;
  autoLockMinutes?: SettingsPatch["autoLockMinutes"] | undefined;
  horizonOverride?: SettingsPatch["horizonOverride"] | undefined;
}): SettingsPatch {
  const patch: SettingsPatch = {};
  if (payload.network !== undefined) patch.network = payload.network;
  if (payload.acknowledgedRealFunds !== undefined)
    patch.acknowledgedRealFunds = payload.acknowledgedRealFunds;
  if (payload.autoLockMinutes !== undefined) patch.autoLockMinutes = payload.autoLockMinutes;
  if (payload.horizonOverride !== undefined) patch.horizonOverride = payload.horizonOverride;
  return patch;
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
