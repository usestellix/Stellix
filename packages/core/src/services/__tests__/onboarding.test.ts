import { describe, expect, it } from "vitest";
import { createFakePlatform } from "../../testing/fake-platform.js";
import {
  ONBOARDING_TTL_MS,
  createWallet,
  importWallet,
  startOnboarding,
  type VerifyAnswer,
} from "../onboarding.js";
import { isUnlocked } from "../session.js";
import { openVault } from "../../vault/vault.js";
import { ABANDON, ABANDON_G0, FAST_SCRYPT, PASSWORD, codeOf } from "./helpers.js";

const opts = { scryptParams: FAST_SCRYPT };

function answersFor(words: string[], positions: number[]): VerifyAnswer[] {
  return positions.map((position) => ({ position, word: words[position]! }));
}

describe("startOnboarding", () => {
  it("returns 12 words and 3 distinct sorted positions, stored in session only", async () => {
    const p = createFakePlatform();
    const { words, verifyPositions } = await startOnboarding(p);
    expect(words).toHaveLength(12);
    expect(verifyPositions).toHaveLength(3);
    expect(new Set(verifyPositions).size).toBe(3);
    expect([...verifyPositions].sort((a, b) => a - b)).toEqual(verifyPositions);
    for (const pos of verifyPositions) {
      expect(pos).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThan(12);
    }
    expect(await p.session.get("pendingOnboarding")).toMatchObject({
      mnemonic: words.join(" "),
      verifyPositions,
    });
    expect(await p.persistent.keys()).toEqual([]);
  });

  it("varies the positions", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i++)
      seen.add(JSON.stringify((await startOnboarding(createFakePlatform())).verifyPositions));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("is refused once a wallet exists", async () => {
    const p = createFakePlatform();
    await p.persistent.set("vault", {});
    expect(await codeOf(startOnboarding(p))).toBe("INVALID_REQUEST");
  });
});

describe("createWallet", () => {
  it("creates the vault, account 0 and an unlocked session; clears the pending phrase", async () => {
    const p = createFakePlatform();
    const { words, verifyPositions } = await startOnboarding(p);
    const accounts = await createWallet(
      p,
      { password: PASSWORD, answers: answersFor(words, verifyPositions) },
      opts,
    );
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ index: 0, label: "Account 1" });
    expect(await p.persistent.get("accounts")).toEqual(accounts);
    expect(await p.persistent.get("activeAccountIndex")).toBe(0);
    expect(await isUnlocked(p)).toBe(true);
    expect(await p.session.get("pendingOnboarding")).toBeUndefined();
    const { plaintext } = await openVault(await p.persistent.get("vault"), PASSWORD);
    expect(plaintext.mnemonic).toBe(words.join(" "));
  });

  it("accepts answers with different case and whitespace", async () => {
    const p = createFakePlatform();
    const { words, verifyPositions } = await startOnboarding(p);
    const answers = answersFor(words, verifyPositions).map((a) => ({
      ...a,
      word: ` ${a.word.toUpperCase()} `,
    }));
    await createWallet(p, { password: PASSWORD, answers }, opts);
  });

  it.each([
    [
      "a wrong word",
      (w: string[], pos: number[]) =>
        answersFor(w, pos).map((a, i) =>
          i === 1 ? { ...a, word: "zoo" === a.word ? "abandon" : "zoo" } : a,
        ),
    ],
    ["a missing answer", (w: string[], pos: number[]) => answersFor(w, pos).slice(0, 2)],
    [
      "answers for other positions",
      (w: string[], pos: number[]) => {
        const other = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
          .filter((x) => !pos.includes(x))
          .slice(0, 3);
        return answersFor(w, other);
      },
    ],
    [
      "a duplicated position",
      (w: string[], pos: number[]) => answersFor(w, [pos[0]!, pos[0]!, pos[1]!]),
    ],
  ])("rejects %s with VERIFICATION_FAILED and writes nothing", async (_name, make) => {
    const p = createFakePlatform();
    const { words, verifyPositions } = await startOnboarding(p);
    expect(
      await codeOf(
        createWallet(p, { password: PASSWORD, answers: make(words, verifyPositions) }, opts),
      ),
    ).toBe("VERIFICATION_FAILED");
    expect(await p.persistent.keys()).toEqual([]);
    expect(await p.session.get("pendingOnboarding")).toBeDefined(); // can retry
  });

  it("rejects a short password", async () => {
    const p = createFakePlatform();
    const { words, verifyPositions } = await startOnboarding(p);
    expect(
      await codeOf(
        createWallet(p, { password: "short", answers: answersFor(words, verifyPositions) }, opts),
      ),
    ).toBe("INVALID_REQUEST");
  });

  it("ONBOARDING_EXPIRED after 30 minutes, and clears the pending phrase", async () => {
    const p = createFakePlatform();
    const { words, verifyPositions } = await startOnboarding(p);
    p.advance(ONBOARDING_TTL_MS + 1);
    expect(
      await codeOf(
        createWallet(p, { password: PASSWORD, answers: answersFor(words, verifyPositions) }, opts),
      ),
    ).toBe("ONBOARDING_EXPIRED");
    expect(await p.session.get("pendingOnboarding")).toBeUndefined();
  });

  it("ONBOARDING_EXPIRED when there is no pending phrase (e.g. browser restarted or locked)", async () => {
    expect(
      await codeOf(createWallet(createFakePlatform(), { password: PASSWORD, answers: [] }, opts)),
    ).toBe("ONBOARDING_EXPIRED");
  });
});

describe("importWallet", () => {
  it("derives the SEP-0005 address for index 0 and unlocks", async () => {
    const p = createFakePlatform();
    const result = await importWallet(p, { mnemonic: ABANDON, password: PASSWORD }, opts);
    expect(result).toEqual({
      accounts: [{ index: 0, publicKey: ABANDON_G0, label: "Account 1" }],
      discoveryIncomplete: false,
    });
    expect(await isUnlocked(p)).toBe(true);
  });

  it("normalizes the phrase before storing it", async () => {
    const p = createFakePlatform();
    await importWallet(p, { mnemonic: `  ${ABANDON.toUpperCase()} `, password: PASSWORD }, opts);
    expect((await openVault(await p.persistent.get("vault"), PASSWORD)).plaintext.mnemonic).toBe(
      ABANDON,
    );
  });

  it.each([
    ["unknown word", ABANDON.replace("about", "aboutt"), "INVALID_MNEMONIC_WORD"],
    ["bad checksum", ABANDON.replace("about", "abandon"), "INVALID_MNEMONIC_CHECKSUM"],
  ])("re-validates in the SW: %s", async (_name, mnemonic, code) => {
    const p = createFakePlatform();
    expect(await codeOf(importWallet(p, { mnemonic, password: PASSWORD }, opts))).toBe(code);
    expect(await p.persistent.keys()).toEqual([]);
  });

  it("is refused once a wallet exists", async () => {
    const p = createFakePlatform();
    await importWallet(p, { mnemonic: ABANDON, password: PASSWORD }, opts);
    expect(await codeOf(importWallet(p, { mnemonic: ABANDON, password: PASSWORD }, opts))).toBe(
      "INVALID_REQUEST",
    );
  });
});
