import { describe, expect, it } from "vitest";
import { createFakePlatform } from "../../testing/fake-platform.js";
import { addAccount, listAccounts, renameAccount, setActiveAccount } from "../accounts.js";
import { importWallet } from "../onboarding.js";
import { lock } from "../session.js";
import { ABANDON, ABANDON_G0, ABANDON_G1, FAST_SCRYPT, PASSWORD, codeOf } from "./helpers.js";

async function wallet() {
  const p = createFakePlatform();
  await importWallet(p, { mnemonic: ABANDON, password: PASSWORD }, { scryptParams: FAST_SCRYPT });
  return p;
}

describe("accounts", () => {
  it("adds the next index with the SEP-0005 address and a default label", async () => {
    const p = await wallet();
    expect(await addAccount(p)).toEqual({ index: 1, publicKey: ABANDON_G1, label: "Account 2" });
    expect((await listAccounts(p)).map((a) => a.publicKey)).toEqual([ABANDON_G0, ABANDON_G1]);
  });

  it("uses max(index) + 1, and accepts a trimmed label", async () => {
    const p = await wallet();
    await p.persistent.set("accounts", [{ index: 3, publicKey: ABANDON_G0, label: "x" }]);
    expect(await addAccount(p, "  Savings ")).toMatchObject({ index: 4, label: "Savings" });
  });

  it("requires unlocked to add", async () => {
    const p = await wallet();
    await lock(p);
    expect(await codeOf(addAccount(p))).toBe("LOCKED");
  });

  it("renames without unlock; rejects bad labels and unknown indices", async () => {
    const p = await wallet();
    await lock(p);
    await renameAccount(p, 0, " Main ");
    expect((await listAccounts(p))[0]?.label).toBe("Main");
    expect(await codeOf(renameAccount(p, 0, "   "))).toBe("INVALID_REQUEST");
    expect(await codeOf(renameAccount(p, 0, "x".repeat(33)))).toBe("INVALID_REQUEST");
    expect(await codeOf(renameAccount(p, 9, "Nope"))).toBe("INVALID_REQUEST");
  });

  it("sets the active account only to an existing index", async () => {
    const p = await wallet();
    await addAccount(p);
    await setActiveAccount(p, 1);
    expect(await p.persistent.get("activeAccountIndex")).toBe(1);
    expect(await codeOf(setActiveAccount(p, 5))).toBe("INVALID_REQUEST");
  });

  it("treats corrupt stored accounts as INTERNAL_ERROR", async () => {
    const p = await wallet();
    await p.persistent.set("accounts", [{ index: "0" }]);
    expect(await codeOf(listAccounts(p))).toBe("INTERNAL_ERROR");
  });
});
