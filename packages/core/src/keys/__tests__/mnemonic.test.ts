import { describe, expect, it } from "vitest";
import {
  generateMnemonic,
  isMnemonicWord,
  normalizeMnemonic,
  parseMnemonic,
  unknownWordPositions,
} from "../mnemonic.js";
import { SEP0005_VECTORS } from "./sep0005.vectors.js";

const TWELVE = SEP0005_VECTORS.find((v) => v.test === 1)!.mnemonic;
const TWENTY_FOUR = SEP0005_VECTORS.find((v) => v.test === 3)!.mnemonic;
const FIFTEEN = SEP0005_VECTORS.find((v) => v.test === 2)!.mnemonic;

function code(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (err: unknown) {
    return (err as { code?: string }).code;
  }
}

describe("generateMnemonic", () => {
  it("produces 12 valid words", () => {
    const phrase = generateMnemonic();
    expect(phrase.split(" ")).toHaveLength(12);
    expect(parseMnemonic(phrase)).toBe(phrase);
  });

  it("produces different phrases", () => {
    expect(generateMnemonic()).not.toBe(generateMnemonic());
  });
});

describe("normalizeMnemonic", () => {
  it("lowercases, trims and collapses whitespace", () => {
    expect(normalizeMnemonic("  Illness\tSPIKE \n retreat  ")).toBe("illness spike retreat");
  });

  it("applies NFKD", () => {
    expect(normalizeMnemonic("café")).toBe("café");
  });
});

describe("parseMnemonic", () => {
  it("accepts 12 and 24 words", () => {
    expect(parseMnemonic(TWELVE)).toBe(TWELVE);
    expect(parseMnemonic(TWENTY_FOUR)).toBe(TWENTY_FOUR);
  });

  it("accepts messy input that normalizes to a valid phrase", () => {
    expect(parseMnemonic(`  ${TWELVE.toUpperCase().replaceAll(" ", "   ")}\n`)).toBe(TWELVE);
  });

  it.each([
    ["15 words (valid BIP39, but not accepted for import)", FIFTEEN],
    ["11 words", TWELVE.split(" ").slice(0, 11).join(" ")],
    ["empty", ""],
  ])("rejects %s as INVALID_MNEMONIC_WORD", (_name, input) => {
    expect(code(() => parseMnemonic(input))).toBe("INVALID_MNEMONIC_WORD");
  });

  it("rejects an unknown word without auto-correcting it", () => {
    const misspelled = TWELVE.replace("spike", "spikee");
    expect(code(() => parseMnemonic(misspelled))).toBe("INVALID_MNEMONIC_WORD");
  });

  it("rejects valid words with a bad checksum", () => {
    const words = TWELVE.split(" ");
    const swapped = [words[1], words[0], ...words.slice(2)].join(" ");
    expect(code(() => parseMnemonic(swapped))).toBe("INVALID_MNEMONIC_CHECKSUM");
  });

  it("never puts the phrase in the error message", () => {
    try {
      parseMnemonic(TWELVE.replace("spike", "spikee"));
    } catch (err: unknown) {
      expect((err as Error).message).not.toMatch(/illness|spikee/);
    }
  });
});

describe("word helpers", () => {
  it("isMnemonicWord", () => {
    expect(isMnemonicWord("abandon")).toBe(true);
    expect(isMnemonicWord(" Abandon ")).toBe(true);
    expect(isMnemonicWord("abandonn")).toBe(false);
  });

  it("unknownWordPositions reports 0-based positions", () => {
    expect(unknownWordPositions(["abandon", "xyz", "about", "qqq"])).toEqual([1, 3]);
  });
});
