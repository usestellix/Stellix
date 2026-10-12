import type { KeyValueStore } from "../platform.js";

/** In-memory KeyValueStore for tests. Values are structured-cloned, like chrome.storage. */
export class MemoryKeyValueStore implements KeyValueStore {
  private readonly data = new Map<string, unknown>();

  get<T>(key: string): Promise<T | undefined> {
    return Promise.resolve(
      this.data.has(key) ? (structuredClone(this.data.get(key)) as T) : undefined,
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

  keys(): string[] {
    return [...this.data.keys()];
  }
}
