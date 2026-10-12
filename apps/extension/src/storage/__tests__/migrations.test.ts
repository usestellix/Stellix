import { MemoryKeyValueStore } from "@stellix/core/testing";
import { describe, expect, it } from "vitest";
import { CURRENT_SCHEMA_VERSION, migrate, type Migration } from "../migrations.js";

describe("migrate", () => {
  it("writes the current schema version on a fresh install", async () => {
    const store = new MemoryKeyValueStore();
    await migrate(store);
    expect(await store.get("schemaVersion")).toBe(CURRENT_SCHEMA_VERSION);
  });

  it("is a no-op at the current version", async () => {
    const store = new MemoryKeyValueStore();
    await store.set("schemaVersion", 1);
    await migrate(store);
    expect(await store.get("schemaVersion")).toBe(1);
  });

  it("runs pending migrations in order and records each step", async () => {
    const store = new MemoryKeyValueStore();
    await store.set("schemaVersion", 1);
    const order: number[] = [];
    const steps: Migration[] = [
      async () => {
        order.push(2);
        await Promise.resolve();
      },
      async () => {
        order.push(3);
        await Promise.resolve();
      },
    ];
    await migrate(store, steps);
    expect(order).toEqual([2, 3]);
    expect(await store.get("schemaVersion")).toBe(3);
  });

  it.each([
    ["a newer version", 99],
    ["a non-number", "1"],
    ["zero", 0],
  ])("refuses %s", async (_name, version) => {
    const store = new MemoryKeyValueStore();
    await store.set("schemaVersion", version);
    await expect(migrate(store)).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
  });
});
