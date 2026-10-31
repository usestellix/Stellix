import { SEP0005_VECTORS } from "../../keys/__tests__/sep0005.vectors.js";
import type { Confirmation } from "../../security/assert-signable.js";
import { DEFAULT_SCRYPT_PARAMS, type ScryptParams } from "../../vault/kdf.js";

/** Minimum allowed N for speed; the production default is unchanged. */
export const FAST_SCRYPT: ScryptParams = { ...DEFAULT_SCRYPT_PARAMS, N: 2 ** 15 };
export const PASSWORD = "correct horse battery";

/** What the Review screen sends when the user presses Confirm (#36). */
export const CLICK: Confirmation = { kind: "click" };

// SEP-0005 Test 5 ("abandon … about"), read from the generated vectors file.
const TEST5 = SEP0005_VECTORS.find((v) => v.test === 5)!;
export const ABANDON = TEST5.mnemonic;
export const ABANDON_G0 = TEST5.accounts[0]!.publicKey;
export const ABANDON_G1 = TEST5.accounts[1]!.publicKey;

export async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  return p.then(
    () => undefined,
    (err: unknown) => (err as { code?: string }).code,
  );
}
