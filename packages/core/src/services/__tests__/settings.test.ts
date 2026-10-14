import { describe, expect, it, vi } from "vitest";
import { MemoryKeyValueStore } from "../../testing/memory-key-value-store.js";
import { updateSettings } from "../settings.js";
import { codeOf } from "./helpers.js";

function deps() {
  return {
    validateHorizonOverride: vi.fn((url: string) => Promise.resolve(url.replace(/\/$/, ""))),
  };
}

describe("updateSettings (SET_SETTINGS)", () => {
  it("switching to mainnet requires acknowledgedRealFunds: true, enforced in core", async () => {
    const persistent = new MemoryKeyValueStore();
    expect(await codeOf(updateSettings({ persistent }, { network: "mainnet" }, deps()))).toBe(
      "INVALID_REQUEST",
    );
    expect(
      await codeOf(
        updateSettings(
          { persistent },
          { network: "mainnet", acknowledgedRealFunds: false },
          deps(),
        ),
      ),
    ).toBe("INVALID_REQUEST");
    expect(await persistent.get("settings")).toBeUndefined();
    expect(
      (
        await updateSettings(
          { persistent },
          { network: "mainnet", acknowledgedRealFunds: true },
          deps(),
        )
      ).network,
    ).toBe("mainnet");
  });

  it("switching back to testnet needs no acknowledgement", async () => {
    const persistent = new MemoryKeyValueStore();
    await persistent.set("settings", { network: "mainnet" });
    expect((await updateSettings({ persistent }, { network: "testnet" }, deps())).network).toBe(
      "testnet",
    );
  });

  it("sets the auto-lock timer and keeps other fields", async () => {
    const persistent = new MemoryKeyValueStore();
    const s = await updateSettings({ persistent }, { autoLockMinutes: 5 }, deps());
    expect(s).toEqual({ network: "testnet", horizonOverrides: {}, autoLockMinutes: 5 });
  });

  it("stores a validated Horizon override and clears it with null", async () => {
    const persistent = new MemoryKeyValueStore();
    const d = deps();
    const set = await updateSettings(
      { persistent },
      { horizonOverride: { network: "testnet", url: "https://h.example/" } },
      d,
    );
    expect(d.validateHorizonOverride).toHaveBeenCalledWith("https://h.example/", "testnet");
    expect(set.horizonOverrides).toEqual({ testnet: "https://h.example" });
    const cleared = await updateSettings(
      { persistent },
      { horizonOverride: { network: "testnet", url: null } },
      d,
    );
    expect(cleared.horizonOverrides).toEqual({});
  });

  it("an invalid override leaves settings untouched", async () => {
    const persistent = new MemoryKeyValueStore();
    const d = {
      validateHorizonOverride: () =>
        Promise.reject(Object.assign(new Error("x"), { code: "INVALID_HORIZON_URL" })),
    };
    expect(
      await codeOf(
        updateSettings(
          { persistent },
          { autoLockMinutes: 30, horizonOverride: { network: "testnet", url: "https://x" } },
          d,
        ),
      ),
    ).toBe("INVALID_HORIZON_URL");
    expect(await persistent.get("settings")).toBeUndefined();
  });
});
