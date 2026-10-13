export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  // Signature from ARCHITECTURE §4; T documents the stored type at call sites.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  /** All stored keys (e.g. to find every `preparedTx:*` entry on lock). */
  keys(): Promise<string[]>;
  /** Removes every key (reset wallet). */
  clear(): Promise<void>;
}

export interface Platform {
  persistent: KeyValueStore; // extension: chrome.storage.local
  session: KeyValueStore; // extension: chrome.storage.session
  now(): number; // injectable clock for tests
  fetch: typeof fetch; // injectable for tests and RN
}
