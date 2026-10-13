import { hex } from "@scure/base";
import { HDKey } from "micro-key-producer/slip10.js";
import { describe, expect, it } from "vitest";
import { SLIP0010_ED25519_VECTORS } from "./slip0010.vectors.js";

// Tests the SLIP-0010 library on its own spec's vectors, independent of SEP-0005.
describe("SLIP-0010 ed25519 test vectors", () => {
  for (const vector of SLIP0010_ED25519_VECTORS) {
    describe(`Test vector ${String(vector.test)}`, () => {
      it.each(vector.chains)("chain $path", ({ path, chainCode, privateKey, publicKey }) => {
        const node = HDKey.fromMasterSeed(hex.decode(vector.seedHex)).derive(path);
        expect(hex.encode(node.chainCode)).toBe(chainCode);
        expect(hex.encode(node.privateKey)).toBe(privateKey);
        expect(hex.encode(node.publicKeyRaw)).toBe(publicKey.slice(2)); // spec prefixes 0x00
      });
    });
  }
});
