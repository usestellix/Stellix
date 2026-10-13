import { describe, expect, it } from "vitest";
import { createFakePlatform } from "../../testing/fake-platform.js";
import { importWallet } from "../onboarding.js";
import {
  UNLOCK_LOCKOUT_MS,
  checkAutoLock,
  isUnlocked,
  lock,
  requireUnlocked,
  touchActivity,
  unlock,
} from "../session.js";
import { ABANDON, FAST_SCRYPT, PASSWORD, codeOf } from "./helpers.js";

async function walletPlatform() {
  const p = createFakePlatform();
  await importWallet(p, { mnemonic: ABANDON, password: PASSWORD }, { scryptParams: FAST_SCRYPT });
  await lock(p);
  return p;
}

describe("unlock", () => {
  it("writes the session key and activity time on the right password", async () => {
    const p = await walletPlatform();
    await unlock(p, PASSWORD);
    expect(await isUnlocked(p)).toBe(true);
    expect(await p.session.get("lastActivityAt")).toBe(p.now());
    expect(JSON.stringify(await p.session.get("sessionKey"))).not.toContain(PASSWORD);
  });

  it("rejects a wrong password with INVALID_PASSWORD and stays locked", async () => {
    const p = await walletPlatform();
    expect(await codeOf(unlock(p, "wrong password"))).toBe("INVALID_PASSWORD");
    expect(await isUnlocked(p)).toBe(false);
  });

  it("rejects with VAULT_NOT_FOUND when there is no wallet", async () => {
    expect(await codeOf(unlock(createFakePlatform(), PASSWORD))).toBe("VAULT_NOT_FOUND");
  });
});

describe("unlock throttle (SW-enforced)", () => {
  it("refuses every attempt for 30 s after 5 consecutive failures — even the right password", async () => {
    const p = await walletPlatform();
    for (let i = 0; i < 5; i++) expect(await codeOf(unlock(p, "wrong"))).toBe("INVALID_PASSWORD");
    expect(await codeOf(unlock(p, PASSWORD))).toBe("UNLOCK_THROTTLED");
    p.advance(UNLOCK_LOCKOUT_MS - 1);
    expect(await codeOf(unlock(p, PASSWORD))).toBe("UNLOCK_THROTTLED");
    p.advance(1);
    await unlock(p, PASSWORD);
    expect(await isUnlocked(p)).toBe(true);
  });

  it("stores throttle state in session storage", async () => {
    const p = await walletPlatform();
    await codeOf(unlock(p, "wrong"));
    expect(await p.session.get("unlockThrottle")).toEqual({ failures: 1, lockedUntil: null });
  });

  it("resets the count after a success", async () => {
    const p = await walletPlatform();
    for (let i = 0; i < 4; i++) await codeOf(unlock(p, "wrong"));
    await unlock(p, PASSWORD);
    expect(await p.session.get("unlockThrottle")).toBeUndefined();
    await lock(p);
    for (let i = 0; i < 4; i++) expect(await codeOf(unlock(p, "wrong"))).toBe("INVALID_PASSWORD");
    await unlock(p, PASSWORD);
  });

  it("gives another 5 attempts after the lockout expires", async () => {
    const p = await walletPlatform();
    for (let i = 0; i < 5; i++) await codeOf(unlock(p, "wrong"));
    p.advance(UNLOCK_LOCKOUT_MS);
    for (let i = 0; i < 4; i++) expect(await codeOf(unlock(p, "wrong"))).toBe("INVALID_PASSWORD");
    expect(await codeOf(unlock(p, "wrong"))).toBe("INVALID_PASSWORD");
    expect(await codeOf(unlock(p, PASSWORD))).toBe("UNLOCK_THROTTLED");
  });

  it("survives lock (lock does not clear it)", async () => {
    const p = await walletPlatform();
    for (let i = 0; i < 5; i++) await codeOf(unlock(p, "wrong"));
    await lock(p);
    expect(await codeOf(unlock(p, PASSWORD))).toBe("UNLOCK_THROTTLED");
  });
});

describe("lock", () => {
  it("removes session key, activity, pending onboarding and every prepared tx", async () => {
    const p = await walletPlatform();
    await unlock(p, PASSWORD);
    await p.session.set("pendingOnboarding", { x: 1 });
    await p.session.set("preparedTx:a", { x: 1 });
    await p.session.set("preparedTx:b", { x: 1 });
    await p.session.set("unlockThrottle", { failures: 1, lockedUntil: null });
    await lock(p);
    expect(await p.session.keys()).toEqual(["unlockThrottle"]);
    expect(await p.persistent.get("vault")).toBeDefined();
  });
});

describe("auto-lock", () => {
  it("locks after the configured idle time, not before", async () => {
    const p = await walletPlatform();
    await unlock(p, PASSWORD);
    p.advance(15 * 60_000);
    expect(await checkAutoLock(p)).toBe(false);
    p.advance(1);
    expect(await checkAutoLock(p)).toBe(true);
    expect(await isUnlocked(p)).toBe(false);
  });

  it("honours settings.autoLockMinutes", async () => {
    const p = await walletPlatform();
    await p.persistent.set("settings", { autoLockMinutes: 5 });
    await unlock(p, PASSWORD);
    p.advance(5 * 60_000 + 1);
    expect(await checkAutoLock(p)).toBe(true);
  });

  it("activity extends the session", async () => {
    const p = await walletPlatform();
    await unlock(p, PASSWORD);
    p.advance(10 * 60_000);
    await touchActivity(p);
    p.advance(10 * 60_000);
    expect(await checkAutoLock(p)).toBe(false);
  });

  it("touchActivity does nothing while locked", async () => {
    const p = await walletPlatform();
    await touchActivity(p);
    expect(await p.session.get("lastActivityAt")).toBeUndefined();
  });

  it("requireUnlocked locks an expired session even if no alarm fired", async () => {
    const p = await walletPlatform();
    await unlock(p, PASSWORD);
    p.advance(16 * 60_000);
    expect(await codeOf(requireUnlocked(p))).toBe("LOCKED");
    expect(await isUnlocked(p)).toBe(false);
  });

  it("treats a missing activity time as expired", async () => {
    const p = await walletPlatform();
    await unlock(p, PASSWORD);
    await p.session.remove("lastActivityAt");
    expect(await checkAutoLock(p)).toBe(true);
  });
});
