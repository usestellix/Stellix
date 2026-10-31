import {
  addAccount,
  awaitOutcome,
  cancelPayment,
  changePassword,
  dismissOutcome,
  preparePayment,
  submitPrepared,
  type NetworkId,
  type SendDeps,
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
import type { InflightResolver } from "./inflight.js";
import { createSerialQueue } from "./serial-queue.js";
import { modeAShieldDeps } from "./shield.js";

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
  /** Networks this build offers (ADR 0008); SET_SETTINGS refuses the rest. */
  enabledNetworks: readonly NetworkId[];
  /** Tests inject a fake; production builds a client for the network's effective URL. */
  horizonFor?: (url: string) => HorizonClient;
  /** Resumes in-flight resolution; created from the same sendDeps (start.ts). */
  inflight?: InflightResolver;
  /** Tests only: a fake clock's sleep for resolution polling. */
  sleep?: (ms: number) => Promise<void>;
}

/** CONFIRM waits this long for inclusion before returning "pending" (ledgers close ~5–6 s). */
const CONFIRM_BUDGET_MS = 20_000;

/** For handlers with no result: awaits the work and returns `undefined` explicitly. */
async function done(work: Promise<void>): Promise<undefined> {
  await work;
  return undefined;
}

export function createHandlers(deps: HandlerDeps): Handlers {
  const { platform, autoLock } = deps;
  const serial = createSerialQueue();
  const opts = deps.onboarding ?? {};
  const opts2 = deps;
  const makeClient = deps.horizonFor ?? ((url: string) => createHorizonClient(url, platform));

  /**
   * Send-service deps with the current overrides (each network gets its effective Horizon), plus
   * Shield's (Mode A: PREPARE analyzes, CONFIRM calls assertSignable).
   */
  const sendDeps = async (): Promise<SendDeps> => {
    const settings = await readSettings(platform.persistent);
    const deps: SendDeps = {
      horizonFor: (network: NetworkId) =>
        makeClient(horizonUrlFor(network, settings.horizonOverrides)),
      ...modeAShieldDeps(),
    };
    if (opts2.sleep !== undefined) deps.sleep = opts2.sleep;
    return deps;
  };

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
      const status = await getStatus(platform);
      // While the popup polls, keep resolving in the background (never blocks the reply).
      if (status.inflight.some((t) => t.status === "resolving"))
        void deps.inflight?.resume().catch(() => undefined);
      return status;
    },
    PREPARE_PAYMENT: (input) =>
      serial(async () => preparePayment(platform, await sendDeps(), toPaymentInput(input))),
    CONFIRM_PAYMENT: async ({ preparedId, confirmation }) => {
      const send = await sendDeps();
      // Phase 1 is exclusive: consume → sign → submit. A concurrent confirm for the same id
      // finds nothing to consume (PREPARED_TX_NOT_FOUND).
      const { hash } = await serial(() => submitPrepared(platform, send, preparedId, confirmation));
      const outcome = await awaitOutcome(platform, send, hash, CONFIRM_BUDGET_MS);
      if (outcome.status === "pending") await deps.inflight?.ensureAlarm();
      return outcome;
    },
    CANCEL_PAYMENT: ({ preparedId }) => serial(() => done(cancelPayment(platform, preparedId))),
    DISMISS_OUTCOME: ({ hash }) => serial(() => done(dismissOutcome(platform, hash))),
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
          enabledNetworks: deps.enabledNetworks,
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

/** Exact optional properties: drop an absent memo key. */
function toPaymentInput(input: {
  destination: string;
  amount: string;
  memo?: { type: "text" | "id"; value: string } | undefined;
}): { destination: string; amount: string; memo?: { type: "text" | "id"; value: string } } {
  return input.memo === undefined
    ? { destination: input.destination, amount: input.amount }
    : { destination: input.destination, amount: input.amount, memo: input.memo };
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
