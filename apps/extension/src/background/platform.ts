import type { Platform } from "@stellix/core";
import { browser } from "wxt/browser";
import { createChromeKeyValueStore } from "../storage/chrome-key-value-store.js";

export function createExtensionPlatform(): Platform {
  return {
    persistent: createChromeKeyValueStore(browser.storage.local),
    session: createChromeKeyValueStore(browser.storage.session),
    now: () => Date.now(),
    fetch: globalThis.fetch.bind(globalThis),
  };
}
