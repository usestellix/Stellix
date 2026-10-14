import { describe, expect, it } from "vitest";
import { createFakePlatform } from "../../testing/fake-platform.js";
import { SEP0005_VECTORS } from "../../keys/__tests__/sep0005.vectors.js";
import { discoverAccounts, renameAccount, setActiveAccount } from "../accounts.js";
import { importWallet } from "../onboarding.js";
import { lock } from "../session.js";
import { ABANDON, FAST_SCRYPT, PASSWORD, codeOf } from "./helpers.js";
import { fakeHorizon } from "./fake-horizon.js";

const G = SEP0005_VECTORS.find((v) => v.test === 5)!.accounts.map((a) => a.publicKey);

describe("importWallet with discovery", () => {
  it("imports every funded index (plus 0), with SEP-0005 addresses", async () => {
    const p = createFakePlatform();
    const h = fakeHorizon(new Set([G[0]!, G[2]!]));
    const result = await importWallet(
      p,
      { mnemonic: ABANDON, password: PASSWORD },
      { scryptParams: FAST_SCRYPT, horizon: h.client },
    );
    expect(result.discoveryIncomplete).toBe(false);
    expect(result.accounts).toEqual([
      { index: 0, publicKey: G[0], label: "Account 1" },
      { index: 2, publicKey: G[2], label: "Account 3" },
    ]);
    expect(await p.persistent.get("accounts")).toEqual(result.accounts);
  });

  it("completes onboarding when discovery fails, flagging it", async () => {
    const p = createFakePlatform();
    const h = fakeHorizon(new Set(), { failOn: G[0]! });
    const result = await importWallet(
      p,
      { mnemonic: ABANDON, password: PASSWORD },
      { scryptParams: FAST_SCRYPT, horizon: h.client },
    );
    expect(result).toMatchObject({
      discoveryIncomplete: true,
      accounts: [{ index: 0, publicKey: G[0] }],
    });
    expect(await p.persistent.get("vault")).toBeDefined();
  });
});

describe("discoverAccounts (DISCOVER_ACCOUNTS)", () => {
  async function wallet() {
    const p = createFakePlatform();
    await importWallet(p, { mnemonic: ABANDON, password: PASSWORD }, { scryptParams: FAST_SCRYPT });
    return p;
  }

  it("only appends new indices; never touches labels or the active account", async () => {
    const p = await wallet();
    await renameAccount(p, 0, "Main");
    await setActiveAccount(p, 0);
    const h = fakeHorizon(new Set([G[0]!, G[1]!, G[3]!]));
    const { added, incomplete } = await discoverAccounts(p, h.client);
    expect(incomplete).toBe(false);
    expect(added.map((a) => a.index)).toEqual([1, 3]);
    expect(await p.persistent.get("accounts")).toEqual([
      { index: 0, publicKey: G[0], label: "Main" },
      { index: 1, publicKey: G[1], label: "Account 2" },
      { index: 3, publicKey: G[3], label: "Account 4" },
    ]);
    expect(await p.persistent.get("activeAccountIndex")).toBe(0);
  });

  it("is a no-op when nothing new is found", async () => {
    const p = await wallet();
    const before = await p.persistent.get("accounts");
    expect((await discoverAccounts(p, fakeHorizon(new Set()).client)).added).toEqual([]);
    expect(await p.persistent.get("accounts")).toEqual(before);
  });

  it("requires unlocked", async () => {
    const p = await wallet();
    await lock(p);
    expect(await codeOf(discoverAccounts(p, fakeHorizon(new Set()).client))).toBe("LOCKED");
  });
});
