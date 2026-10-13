import { DEFAULT_SCRYPT_PARAMS, importWallet, isUnlocked } from "@stellix/core";
import { createFakePlatform } from "@stellix/core/testing";
import { describe, expect, it } from "vitest";
import { AUTOLOCK_ALARM, createAutoLock } from "../autolock.js";
import { createFakeAlarms } from "./fake-alarms.js";

async function unlockedPlatform() {
  const platform = createFakePlatform();
  await importWallet(
    platform,
    {
      mnemonic:
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
      password: "correct horse battery",
    },
    { scryptParams: { ...DEFAULT_SCRYPT_PARAMS, N: 2 ** 15 } },
  );
  return platform;
}

describe("autolock", () => {
  it("ensure() creates the 30 s alarm once and never resets it", async () => {
    const platform = await unlockedPlatform();
    const fake = createFakeAlarms();
    const auto = createAutoLock(platform, fake.api);
    await auto.ensure();
    await auto.ensure();
    expect(fake.creates()).toBe(1);
    expect(fake.alarms.get(AUTOLOCK_ALARM)?.periodInMinutes).toBe(0.5);
  });

  it("the alarm locks an idle wallet and clears itself", async () => {
    const platform = await unlockedPlatform();
    const fake = createFakeAlarms();
    const auto = createAutoLock(platform, fake.api);
    await auto.ensure();
    platform.advance(15 * 60_000 + 1);
    await auto.check();
    expect(await isUnlocked(platform)).toBe(false);
    expect(fake.alarms.size).toBe(0);
  });

  it("ignores other alarms", async () => {
    const platform = await unlockedPlatform();
    const auto = createAutoLock(platform, createFakeAlarms().api);
    platform.advance(16 * 60_000);
    auto.onAlarm({ name: "something-else" });
    await Promise.resolve();
    expect(await isUnlocked(platform)).toBe(true);
  });

  it("onStartup re-ensures the alarm while unlocked and locks if already expired", async () => {
    const platform = await unlockedPlatform();
    const fake = createFakeAlarms();
    await createAutoLock(platform, fake.api).onStartup();
    expect(fake.alarms.has(AUTOLOCK_ALARM)).toBe(true);

    platform.advance(16 * 60_000);
    await createAutoLock(platform, fake.api).onStartup();
    expect(await isUnlocked(platform)).toBe(false);
    expect(fake.alarms.size).toBe(0);
  });
});
