import { StellixError, type KeyValueStore } from "@stellix/core";
import type { Browser } from "wxt/browser";

/** core KeyValueStore over a chrome.storage area (local or session). */
export function createChromeKeyValueStore(area: Browser.storage.StorageArea): KeyValueStore {
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const items = await guard(() => area.get(key), "read");
      // Stored values are trusted to match T: only this extension writes them, and readers that
      // depend on shape validate it (e.g. getStatus).
      return items[key] as T | undefined;
    },
    async set(key: string, value: unknown): Promise<void> {
      await guard(() => area.set({ [key]: value }), "write");
    },
    async remove(key: string): Promise<void> {
      await guard(() => area.remove(key), "remove");
    },
    async keys(): Promise<string[]> {
      // get(null) returns every item; only the keys are used.
      return Object.keys(await guard(() => area.get(null), "list"));
    },
    async clear(): Promise<void> {
      await guard(() => area.clear(), "clear");
    },
  };
}

async function guard<T>(op: () => Promise<T>, action: string): Promise<T> {
  try {
    return await op();
  } catch {
    // The browser's message may echo the key or value; never forward it.
    throw new StellixError("INTERNAL_ERROR", `Storage ${action} failed`, true);
  }
}
