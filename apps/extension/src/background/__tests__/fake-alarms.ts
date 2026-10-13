import type { AlarmsApi } from "../autolock.js";

/** Minimal in-memory chrome.alarms for tests. */
export function createFakeAlarms() {
  const alarms = new Map<string, { name: string; periodInMinutes?: number }>();
  let creates = 0;
  const api: AlarmsApi = {
    create: ((name: string, info: { periodInMinutes?: number }) => {
      creates++;
      alarms.set(name, { name, ...info });
      return Promise.resolve();
    }) as AlarmsApi["create"],
    get: ((name: string) => Promise.resolve(alarms.get(name))) as AlarmsApi["get"],
    clear: ((name: string) => Promise.resolve(alarms.delete(name))) as AlarmsApi["clear"],
  };
  return { api, alarms, creates: () => creates };
}
