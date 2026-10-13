import { describe, expect, it } from "vitest";
import { passwordStrength, assertPasswordPolicy } from "../password.js";
import { randomDistinct, randomInt } from "../random.js";
import { DEFAULT_SETTINGS, readSettings } from "../settings.js";
import { MemoryKeyValueStore } from "../testing/memory-key-value-store.js";

describe("readSettings", () => {
  it("returns defaults when absent", async () => {
    expect(await readSettings(new MemoryKeyValueStore())).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid fields and replaces only malformed ones", async () => {
    const store = new MemoryKeyValueStore();
    await store.set("settings", { network: "mainnet", autoLockMinutes: 7, horizonOverrides: "x" });
    expect(await readSettings(store)).toEqual({
      network: "mainnet",
      autoLockMinutes: 15,
      horizonOverrides: {},
    });
  });
});

describe("password", () => {
  it("enforces 8 characters (code points)", () => {
    expect(() => {
      assertPasswordPolicy("1234567");
    }).toThrow(expect.objectContaining({ code: "INVALID_REQUEST" }));
    expect(() => {
      assertPasswordPolicy("12345678");
    }).not.toThrow();
  });

  it("scores strength", () => {
    expect(passwordStrength("short")).toBe("weak");
    expect(passwordStrength("abcdefgh")).toBe("fair");
    expect(passwordStrength("abcdefghijkl")).toBe("fair");
    expect(passwordStrength("Abcdefgh1jkl")).toBe("good");
    expect(passwordStrength("Abcdefgh1jkl!mnop")).toBe("strong");
  });
});

describe("random", () => {
  it("randomInt stays in range and covers it", () => {
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = randomInt(12);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(12);
      seen.add(v);
    }
    expect(seen.size).toBe(12);
  });

  it("randomDistinct returns sorted distinct values", () => {
    const v = randomDistinct(3, 12);
    expect(new Set(v).size).toBe(3);
    expect([...v].sort((a, b) => a - b)).toEqual(v);
  });

  it("rejects bad ranges", () => {
    expect(() => randomInt(0)).toThrow();
    expect(() => randomDistinct(13, 12)).toThrow();
  });
});

describe("password length counts code points", () => {
  it("counts an astral character (emoji) once", () => {
    expect(() => {
      assertPasswordPolicy("\u{1F512}234567");
    }).toThrow(); // 7 code points
    expect(() => {
      assertPasswordPolicy("\u{1F512}2345678");
    }).not.toThrow(); // 8 code points
  });
});
