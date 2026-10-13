import { generateMnemonic as bip39Generate, validateMnemonic as bip39Validate } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { StellixError } from "../errors.js";

// BIP39 recovery phrases (KEY_MANAGEMENT §1). English wordlist only.

export const CREATE_WORD_COUNT = 12;
export const IMPORT_WORD_COUNTS = [12, 24] as const;

const WORDS = new Set(wordlist);

/** The BIP39 English wordlist (public data; the onboarding page uses it for autocomplete). */
export const MNEMONIC_WORDLIST: readonly string[] = wordlist;

/** A fresh 12-word phrase (128 bits of entropy from crypto.getRandomValues). */
export function generateMnemonic(): string {
  return bip39Generate(wordlist, 128);
}

/** Lowercase, trim, collapse internal whitespace, Unicode NFKD (BIP39 requirement). */
export function normalizeMnemonic(input: string): string {
  return input.normalize("NFKD").toLowerCase().trim().split(/\s+/u).join(" ");
}

export function isMnemonicWord(word: string): boolean {
  return WORDS.has(word.normalize("NFKD").toLowerCase().trim());
}

/** 0-based positions of words not in the wordlist. The UI uses this to highlight inputs. */
export function unknownWordPositions(words: readonly string[]): number[] {
  const positions: number[] = [];
  words.forEach((word, i) => {
    if (!isMnemonicWord(word)) positions.push(i);
  });
  return positions;
}

/**
 * Normalizes and validates an imported phrase. Never auto-corrects.
 * Errors never include the phrase or any word from it.
 */
export function parseMnemonic(input: string): string {
  const normalized = normalizeMnemonic(input);
  const words = normalized === "" ? [] : normalized.split(" ");
  if (!(IMPORT_WORD_COUNTS as readonly number[]).includes(words.length)) {
    throw new StellixError("INVALID_MNEMONIC_WORD", "Recovery phrase must be 12 or 24 words");
  }
  if (unknownWordPositions(words).length > 0) {
    throw new StellixError("INVALID_MNEMONIC_WORD", "Recovery phrase contains unknown words");
  }
  if (!bip39Validate(normalized, wordlist)) {
    throw new StellixError("INVALID_MNEMONIC_CHECKSUM", "Recovery phrase checksum is invalid");
  }
  return normalized;
}
