import { describe, expect, it } from "vitest";
import { MemoryKeyValueStore } from "../memory-key-value-store.js";

describe("MemoryKeyValueStore", () => {
  it("gets, sets and removes", async () => {
    const store = new MemoryKeyValueStore();
    expect(await store.get("a")).toBeUndefined();
    await store.set("a", { n: 1 });
    expect(await store.get("a")).toEqual({ n: 1 });
    await store.remove("a");
    expect(await store.get("a")).toBeUndefined();
  });

  it("stores copies, not references", async () => {
    const store = new MemoryKeyValueStore();
    const value = { n: 1 };
    await store.set("a", value);
    value.n = 2;
    expect(await store.get("a")).toEqual({ n: 1 });
  });
});
