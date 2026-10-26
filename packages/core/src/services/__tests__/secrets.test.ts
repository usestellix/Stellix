import { describe, expect, it } from "vitest";
import { createFakePlatform } from "../../testing/fake-platform.js";
import { importWallet } from "../onboarding.js";
import { changePassword, resetWallet, revealPhrase } from "../secrets.js";
import { isUnlocked, lock, unlock } from "../session.js";
import { openVaultWithKey } from "../../vault/vault.js";
import { fromBase64 } from "../../vault/encoding.js";
import { ABANDON, FAST_SCRYPT, PASSWORD, codeOf } from "./helpers.js";

// Each password check runs scrypt at the lowest work factor a vault accepts (2^15), so a test
// with several of them can pass 5 s on a loaded runner.
const SCRYPT_HEAVY = { timeout: 30_000 };

async function wallet() {
  const p = createFakePlatform();
  await importWallet(p, { mnemonic: ABANDON, password: PASSWORD }, { scryptParams: FAST_SCRYPT });
  return p;
}

describe("revealPhrase", SCRYPT_HEAVY, () => {
  it("requires the password even when unlocked", async () => {
    const p = await wallet();
    expect(await revealPhrase(p, PASSWORD)).toEqual({ words: ABANDON.split(" ") });
    expect(await codeOf(revealPhrase(p, "wrong password"))).toBe("INVALID_PASSWORD");
  });

  it("requires unlocked", async () => {
    const p = await wallet();
    await lock(p);
    expect(await codeOf(revealPhrase(p, PASSWORD))).toBe("LOCKED");
  });

  it("shares the unlock throttle", async () => {
    const p = await wallet();
    for (let i = 0; i < 5; i++) await codeOf(revealPhrase(p, "wrong password"));
    expect(await codeOf(revealPhrase(p, PASSWORD))).toBe("UNLOCK_THROTTLED");
  });
});

describe("changePassword", SCRYPT_HEAVY, () => {
  it("re-encrypts, keeps the phrase, and replaces the session key", async () => {
    const p = await wallet();
    const before = await p.persistent.get<{ kdf: { salt: string } }>("vault");
    await changePassword(p, { current: PASSWORD, next: "a brand new password" }, FAST_SCRYPT);
    const after = await p.persistent.get<{ kdf: { salt: string } }>("vault");
    expect(after?.kdf.salt).not.toBe(before?.kdf.salt);
    expect(await isUnlocked(p)).toBe(true);
    const sessionKey = fromBase64((await p.session.get<string>("sessionKey"))!);
    expect((await openVaultWithKey(after, sessionKey)).mnemonic).toBe(ABANDON);
    await lock(p);
    expect(await codeOf(unlock(p, PASSWORD))).toBe("INVALID_PASSWORD");
    await unlock(p, "a brand new password");
  });

  it("leaves the vault untouched on a wrong current password or a short new one", async () => {
    const p = await wallet();
    const before = await p.persistent.get("vault");
    expect(
      await codeOf(
        changePassword(p, { current: "wrong password", next: "another password" }, FAST_SCRYPT),
      ),
    ).toBe("INVALID_PASSWORD");
    expect(await codeOf(changePassword(p, { current: PASSWORD, next: "short" }, FAST_SCRYPT))).toBe(
      "INVALID_REQUEST",
    );
    expect(await p.persistent.get("vault")).toEqual(before);
  });

  it("requires unlocked", async () => {
    const p = await wallet();
    await lock(p);
    expect(
      await codeOf(changePassword(p, { current: PASSWORD, next: "another password" }, FAST_SCRYPT)),
    ).toBe("LOCKED");
  });
});

describe("resetWallet", SCRYPT_HEAVY, () => {
  it("wipes both stores only with the exact confirmation", async () => {
    const p = await wallet();
    expect(await codeOf(resetWallet(p, "reset"))).toBe("INVALID_REQUEST");
    expect(await p.persistent.keys()).not.toEqual([]);
    await resetWallet(p, "RESET");
    expect(await p.persistent.keys()).toEqual([]);
    expect(await p.session.keys()).toEqual([]);
  });
});
