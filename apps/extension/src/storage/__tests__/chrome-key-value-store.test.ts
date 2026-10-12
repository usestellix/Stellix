import { beforeEach, describe, expect, it } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";
import { createChromeKeyValueStore } from "../chrome-key-value-store.js";

describe("createChromeKeyValueStore", () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it("round-trips values in local storage", async () => {
    const store = createChromeKeyValueStore(fakeBrowser.storage.local);
    expect(await store.get("settings")).toBeUndefined();
    await store.set("settings", { network: "testnet" });
    expect(await store.get("settings")).toEqual({ network: "testnet" });
    await store.remove("settings");
    expect(await store.get("settings")).toBeUndefined();
  });

  it("keeps local and session areas separate", async () => {
    const local = createChromeKeyValueStore(fakeBrowser.storage.local);
    const session = createChromeKeyValueStore(fakeBrowser.storage.session);
    await session.set("sessionKey", "k");
    expect(await local.get("sessionKey")).toBeUndefined();
    expect(await session.get("sessionKey")).toBe("k");
  });

  it("maps storage failures to INTERNAL_ERROR without the browser's message", async () => {
    const failing = {
      ...fakeBrowser.storage.local,
      get: () => Promise.reject(new Error("quota exceeded for key secret")),
    } as unknown as typeof fakeBrowser.storage.local;
    const err: unknown = await createChromeKeyValueStore(failing)
      .get("x")
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "INTERNAL_ERROR" });
    expect((err as Error).message).not.toContain("secret");
  });
});
