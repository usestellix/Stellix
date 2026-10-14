import { describe, expect, it } from "vitest";
import { MemoryKeyValueStore } from "../../testing/memory-key-value-store.js";
import { getStatus } from "../get-status.js";

function platform() {
  return { persistent: new MemoryKeyValueStore(), session: new MemoryKeyValueStore() };
}

describe("getStatus", () => {
  it("reports a fresh install", async () => {
    expect(await getStatus(platform())).toEqual({
      hasVault: false,
      unlocked: false,
      network: "testnet",
      activeAccountIndex: null,
      inflight: [],
    });
  });

  it("reports locked when a vault exists without a session key", async () => {
    const p = platform();
    await p.persistent.set("vault", { version: 1 });
    await p.persistent.set("activeAccountIndex", 0);
    expect(await getStatus(p)).toMatchObject({
      hasVault: true,
      unlocked: false,
      activeAccountIndex: 0,
    });
  });

  it("reports unlocked when vault and session key both exist", async () => {
    const p = platform();
    await p.persistent.set("vault", { version: 1 });
    await p.session.set("sessionKey", "base64key");
    expect((await getStatus(p)).unlocked).toBe(true);
  });

  it("is never unlocked without a vault, even if a stale session key exists", async () => {
    const p = platform();
    await p.session.set("sessionKey", "base64key");
    expect((await getStatus(p)).unlocked).toBe(false);
  });

  it("reads the network from settings", async () => {
    const p = platform();
    await p.persistent.set("settings", { network: "mainnet" });
    expect((await getStatus(p)).network).toBe("mainnet");
  });

  it("falls back to testnet for malformed settings or index", async () => {
    const p = platform();
    await p.persistent.set("settings", { network: "devnet" });
    await p.persistent.set("activeAccountIndex", -1);
    expect(await getStatus(p)).toMatchObject({ network: "testnet", activeAccountIndex: null });
  });
});
