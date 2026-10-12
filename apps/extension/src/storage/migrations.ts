import { PERSISTENT_KEYS, StellixError, type KeyValueStore } from "@stellix/core";

// Storage migrations (ARCHITECTURE §10). Run on SW startup before any message is handled.
// MIGRATIONS[n] upgrades schemaVersion n+1 → n+2. Each is a pure function, tested.

export const CURRENT_SCHEMA_VERSION = 1;

export type Migration = (store: KeyValueStore) => Promise<void>;

export const MIGRATIONS: readonly Migration[] = [];

export async function migrate(
  store: KeyValueStore,
  migrations: readonly Migration[] = MIGRATIONS,
): Promise<void> {
  const target = migrations.length + 1;
  const stored = await store.get<unknown>(PERSISTENT_KEYS.schemaVersion);

  if (stored === undefined) {
    // Fresh install: nothing to migrate.
    await store.set(PERSISTENT_KEYS.schemaVersion, target);
    return;
  }
  if (typeof stored !== "number" || !Number.isSafeInteger(stored) || stored < 1) {
    throw new StellixError("INTERNAL_ERROR", "Invalid storage schema version");
  }
  if (stored > target) {
    throw new StellixError("INTERNAL_ERROR", "Storage schema is newer than this build");
  }

  for (let version = stored; version < target; version++) {
    const step = migrations[version - 1];
    if (step === undefined) throw new StellixError("INTERNAL_ERROR", "Missing storage migration");
    await step(store);
    await store.set(PERSISTENT_KEYS.schemaVersion, version + 1);
  }
}
