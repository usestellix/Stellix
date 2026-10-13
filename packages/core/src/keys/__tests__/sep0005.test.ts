import { hex } from "@scure/base";
import { describe, expect, it } from "vitest";
import { mnemonicToSeed as bip39ToSeed } from "@scure/bip39";
import { deriveKeypair, derivePublicKey, mnemonicToSeed } from "../derive.js";
import { SEP0005_VECTORS } from "./sep0005.vectors.js";

describe("SEP-0005 test vectors", () => {
  for (const vector of SEP0005_VECTORS) {
    // Passphrase vectors stay in the file but are skipped until BIP39 passphrase support exists
    // (KEY_MANAGEMENT §1; out of MVP scope).
    const suite = vector.passphrase === "" ? describe : describe.skip;

    suite(`Test ${String(vector.test)}`, () => {
      it("derives the published BIP39 seed", async () => {
        expect(hex.encode(await mnemonicToSeed(vector.mnemonic))).toBe(vector.seedHex);
      });

      it.each(vector.accounts)("account $index", async ({ index, publicKey, secretKey }) => {
        const seed = await mnemonicToSeed(vector.mnemonic);
        const keypair = deriveKeypair(seed, index);
        expect(keypair.publicKey()).toBe(publicKey);
        expect(keypair.secret()).toBe(secretKey);
        expect(derivePublicKey(seed, index)).toBe(publicKey);
      });
    });
  }

  it("skipped passphrase vector still matches with the passphrase (sanity check of the file)", async () => {
    const vector = SEP0005_VECTORS.find((v) => v.passphrase !== "");
    expect(vector).toBeDefined();
    const seed = await bip39ToSeed(vector!.mnemonic, vector!.passphrase);
    expect(hex.encode(seed)).toBe(vector!.seedHex);
  });
});

describe("deriveKeypair", () => {
  it.each([-1, 1.5, 2 ** 31, Number.NaN])("rejects index %s", async (index) => {
    const seed = await mnemonicToSeed(SEP0005_VECTORS[0]!.mnemonic);
    expect(() => deriveKeypair(seed, index)).toThrow(
      expect.objectContaining({ code: "INTERNAL_ERROR" }),
    );
  });
});
