import type { KeyValueStore } from "../platform.js";

/**
 * In-memory KeyValueStore for tests. Like chrome.storage, values are copied and object keys come
 * back sorted (Chrome stores them in a sorted dictionary), so code that depends on insertion order
 * fails here, not just in the browser.
 */
export class MemoryKeyValueStore implements KeyValueStore {
  private readonly data = new Map<string, unknown>();

  get<T>(key: string): Promise<T | undefined> {
    return Promise.resolve(
      this.data.has(key) ? (sortKeysDeep(this.data.get(key)) as T) : undefined,
    );
  }

  set(key: string, value: unknown): Promise<void> {
    this.data.set(key, structuredClone(value));
    return Promise.resolve();
  }

  remove(key: string): Promise<void> {
    this.data.delete(key);
    return Promise.resolve();
  }

  keys(): Promise<string[]> {
    return Promise.resolve([...this.data.keys()]);
  }

  clear(): Promise<void> {
    this.data.clear();
    return Promise.resolve();
  }
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, sortKeysDeep((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}
