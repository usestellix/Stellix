import { checkAutoLock, isUnlocked, type Platform } from "@stellix/core";
import type { Browser } from "wxt/browser";

// Auto-lock via chrome.alarms (ARCHITECTURE §6.3). Timers in the SW die with the worker; alarms
// wake it. Alarms aren't guaranteed to survive restarts, so they're re-ensured on every start.

export const AUTOLOCK_ALARM = "autolock";
const PERIOD_MINUTES = 0.5; // Chrome's minimum

export type AlarmsApi = Pick<typeof Browser.alarms, "create" | "get" | "clear">;

export interface AutoLock {
  /** Creates the alarm if it doesn't exist (never resets an existing schedule). */
  ensure(): Promise<void>;
  clear(): Promise<void>;
  /** Locks if idle too long; clears the alarm whenever the wallet ends up locked. */
  check(): Promise<void>;
  /** SW startup: re-check immediately, then ensure or clear the alarm. */
  onStartup(): Promise<void>;
  onAlarm(alarm: { name: string }): void;
}

export function createAutoLock(
  platform: Pick<Platform, "persistent" | "session" | "now">,
  alarms: AlarmsApi,
): AutoLock {
  const ensure = async (): Promise<void> => {
    if ((await alarms.get(AUTOLOCK_ALARM)) === undefined) {
      await alarms.create(AUTOLOCK_ALARM, { periodInMinutes: PERIOD_MINUTES });
    }
  };
  const clear = async (): Promise<void> => {
    await alarms.clear(AUTOLOCK_ALARM);
  };
  const check = async (): Promise<void> => {
    await checkAutoLock(platform);
    if (!(await isUnlocked(platform))) await clear();
  };
  return {
    ensure,
    clear,
    check,
    onStartup: async () => {
      await check();
      if (await isUnlocked(platform)) await ensure();
    },
    onAlarm: (alarm) => {
      if (alarm.name === AUTOLOCK_ALARM) void check();
    },
  };
}
