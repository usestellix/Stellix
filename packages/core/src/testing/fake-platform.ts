import type { Platform } from "../platform.js";
import { MemoryKeyValueStore } from "./memory-key-value-store.js";

/** In-memory Platform with a controllable clock. */
export interface FakePlatform extends Platform {
  persistent: MemoryKeyValueStore;
  session: MemoryKeyValueStore;
  advance(ms: number): void;
}

export function createFakePlatform(startMs = 1_760_000_000_000): FakePlatform {
  let now = startMs;
  return {
    persistent: new MemoryKeyValueStore(),
    session: new MemoryKeyValueStore(),
    now: () => now,
    advance: (ms) => {
      now += ms;
    },
    fetch: () => Promise.reject(new Error("FakePlatform has no network")),
  };
}
