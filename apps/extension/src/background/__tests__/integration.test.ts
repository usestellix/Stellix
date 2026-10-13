import { DEFAULT_SCRYPT_PARAMS, createLogger, type AccountMeta } from "@stellix/core";
import { createFakePlatform, type FakePlatform } from "@stellix/core/testing";
import { describe, expect, it, vi } from "vitest";
import type { RequestType } from "../../messaging/protocol.js";
import { handleMessage } from "../../messaging/router.js";
import { AUTOLOCK_ALARM, createAutoLock } from "../autolock.js";
import { createHandlers, createTouchActivity } from "../handlers.js";
import { createFakeAlarms } from "./fake-alarms.js";

// Drives real handlers + real core services through the real router and sender checks.

const BASE = "chrome-extension://abcdefghijklmnop/";
const POPUP = { id: "abcdefghijklmnop", url: `${BASE}popup.html` };
const ONBOARDING = { id: "abcdefghijklmnop", url: `${BASE}onboarding.html` };
const PASSWORD = "correct horse battery";
const ABANDON =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

function setup() {
  const platform: FakePlatform = createFakePlatform();
  const fakeAlarms = createFakeAlarms();
  const autoLock = createAutoLock(platform, fakeAlarms.api);
  const openOnboarding = vi.fn(() => Promise.resolve());
  const deps = {
    handlers: createHandlers({
      platform,
      autoLock,
      openOnboarding,
      onboarding: { scryptParams: { ...DEFAULT_SCRYPT_PARAMS, N: 2 ** 15 } },
    }),
    sender: { runtimeId: "abcdefghijklmnop", extensionBaseUrl: BASE },
    ready: Promise.resolve(),
    touchActivity: createTouchActivity(platform, autoLock),
    log: createLogger({ minLevel: "error", sink: () => undefined }),
  };
  let n = 0;
  const send = async (type: RequestType, payload?: unknown, sender = POPUP) => {
    const id = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
    const res = await handleMessage({ id, type, payload }, sender, deps);
    if (res.ok) return { ok: true as const, data: res.data };
    return { ok: false as const, code: res.error.code };
  };
  return { platform, fakeAlarms, openOnboarding, send };
}

async function importedWallet() {
  const s = setup();
  expect(
    await s.send("ONBOARD_IMPORT", { mnemonic: ABANDON, password: PASSWORD }, ONBOARDING),
  ).toMatchObject({
    ok: true,
  });
  return s;
}

describe("page restrictions", () => {
  it.each([
    ["ONBOARD_GENERATE", undefined],
    ["ONBOARD_CREATE", { password: PASSWORD, answers: [] }],
    ["ONBOARD_IMPORT", { mnemonic: ABANDON, password: PASSWORD }],
    ["REVEAL_PHRASE", { password: PASSWORD }],
  ] as const)("the popup can't send %s", async (type, payload) => {
    const s = await importedWallet();
    expect(await s.send(type, payload, POPUP)).toEqual({ ok: false, code: "UNAUTHORIZED_SENDER" });
  });
});

describe("create flow", () => {
  it("generate → create with answers → unlocked with the auto-lock alarm running", async () => {
    const s = setup();
    const gen = await s.send("ONBOARD_GENERATE", undefined, ONBOARDING);
    const { words, verifyPositions } = gen.data as { words: string[]; verifyPositions: number[] };
    const answers = verifyPositions.map((position) => ({ position, word: words[position] }));
    const created = await s.send("ONBOARD_CREATE", { password: PASSWORD, answers }, ONBOARDING);
    expect(created).toMatchObject({
      ok: true,
      data: { accounts: [{ index: 0, label: "Account 1" }] },
    });
    expect(await s.send("GET_STATUS")).toMatchObject({
      data: { hasVault: true, unlocked: true, activeAccountIndex: 0 },
    });
    expect(s.fakeAlarms.alarms.get(AUTOLOCK_ALARM)).toEqual({
      name: AUTOLOCK_ALARM,
      periodInMinutes: 0.5,
    });
  });

  it("wrong answers → VERIFICATION_FAILED", async () => {
    const s = setup();
    const gen = await s.send("ONBOARD_GENERATE", undefined, ONBOARDING);
    const { verifyPositions } = gen.data as { verifyPositions: number[] };
    const answers = verifyPositions.map((position) => ({ position, word: "zzz" }));
    expect(await s.send("ONBOARD_CREATE", { password: PASSWORD, answers }, ONBOARDING)).toEqual({
      ok: false,
      code: "VERIFICATION_FAILED",
    });
  });
});

describe("lock / unlock", () => {
  it("LOCK clears the session and the alarm; UNLOCK restores both", async () => {
    const s = await importedWallet();
    expect(await s.send("LOCK")).toEqual({ ok: true, data: undefined });
    expect(await s.send("GET_STATUS")).toMatchObject({ data: { unlocked: false } });
    expect(s.fakeAlarms.alarms.has(AUTOLOCK_ALARM)).toBe(false);
    expect(await s.send("UNLOCK", { password: "wrong password" })).toEqual({
      ok: false,
      code: "INVALID_PASSWORD",
    });
    expect(await s.send("UNLOCK", { password: PASSWORD })).toEqual({
      ok: true,
      data: { ok: true },
    });
    expect(s.fakeAlarms.alarms.has(AUTOLOCK_ALARM)).toBe(true);
  });

  it("throttles in the SW after 5 wrong passwords", async () => {
    const s = await importedWallet();
    await s.send("LOCK");
    for (let i = 0; i < 5; i++) await s.send("UNLOCK", { password: "wrong password" });
    expect(await s.send("UNLOCK", { password: PASSWORD })).toEqual({
      ok: false,
      code: "UNLOCK_THROTTLED",
    });
    s.platform.advance(30_000);
    expect(await s.send("UNLOCK", { password: PASSWORD })).toMatchObject({ ok: true });
  });
});

describe("auto-lock", () => {
  it("a request after the idle timeout locks instead of refreshing the clock", async () => {
    const s = await importedWallet();
    s.platform.advance(15 * 60_000 + 1);
    expect(await s.send("ADD_ACCOUNT", {})).toEqual({ ok: false, code: "LOCKED" });
    expect(await s.send("GET_STATUS")).toMatchObject({ data: { unlocked: false } });
  });

  it("activity within the timeout keeps the wallet unlocked", async () => {
    const s = await importedWallet();
    s.platform.advance(10 * 60_000);
    await s.send("LIST_ACCOUNTS");
    s.platform.advance(10 * 60_000);
    expect(await s.send("ADD_ACCOUNT", {})).toMatchObject({ ok: true });
  });

  it("GET_STATUS reports locked once expired but never extends the session", async () => {
    const s = await importedWallet();
    s.platform.advance(14 * 60_000);
    await s.send("GET_STATUS");
    s.platform.advance(2 * 60_000);
    expect(await s.send("GET_STATUS")).toMatchObject({ data: { unlocked: false } });
  });
});

describe("accounts", () => {
  it("add, rename, switch", async () => {
    const s = await importedWallet();
    const added = (await s.send("ADD_ACCOUNT", { label: "Savings" })).data as AccountMeta;
    expect(added).toMatchObject({ index: 1, label: "Savings" });
    await s.send("RENAME_ACCOUNT", { index: 0, label: "Main" });
    await s.send("SET_ACTIVE_ACCOUNT", { index: 1 });
    expect((await s.send("LIST_ACCOUNTS")).data).toMatchObject([
      { label: "Main" },
      { label: "Savings" },
    ]);
    expect(await s.send("GET_STATUS")).toMatchObject({ data: { activeAccountIndex: 1 } });
  });

  it("serializes concurrent ADD_ACCOUNT so indices never collide", async () => {
    const s = await importedWallet();
    const results = await Promise.all([
      s.send("ADD_ACCOUNT", {}),
      s.send("ADD_ACCOUNT", {}),
      s.send("ADD_ACCOUNT", {}),
    ]);
    expect(results.map((r) => (r.data as AccountMeta).index).sort()).toEqual([1, 2, 3]);
  });
});

describe("secrets", () => {
  it("REVEAL_PHRASE from the onboarding page with the password", async () => {
    const s = await importedWallet();
    expect(await s.send("REVEAL_PHRASE", { password: PASSWORD }, ONBOARDING)).toEqual({
      ok: true,
      data: { words: ABANDON.split(" ") },
    });
  });

  it("CHANGE_PASSWORD then unlock with the new one", async () => {
    const s = await importedWallet();
    expect(
      await s.send("CHANGE_PASSWORD", { current: PASSWORD, next: "another password" }),
    ).toMatchObject({ ok: true });
    await s.send("LOCK");
    expect(await s.send("UNLOCK", { password: PASSWORD })).toEqual({
      ok: false,
      code: "INVALID_PASSWORD",
    });
    expect(await s.send("UNLOCK", { password: "another password" })).toMatchObject({ ok: true });
  });

  it("RESET_WALLET wipes storage, keeps schemaVersion, clears the alarm and opens onboarding", async () => {
    const s = await importedWallet();
    expect(await s.send("RESET_WALLET", { confirmation: "reset" })).toEqual({
      ok: false,
      code: "INVALID_REQUEST",
    });
    expect(await s.send("RESET_WALLET", { confirmation: "RESET" })).toMatchObject({ ok: true });
    expect(await s.platform.persistent.keys()).toEqual(["schemaVersion"]);
    expect(await s.platform.session.keys()).toEqual([]);
    expect(s.fakeAlarms.alarms.size).toBe(0);
    expect(s.openOnboarding).toHaveBeenCalledOnce();
    expect(await s.send("GET_STATUS")).toMatchObject({ data: { hasVault: false } });
  });
});
