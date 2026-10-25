import { describe, expect, it } from "vitest";
import { UNSUPPORTED_OPS, envelopeWith } from "../../__tests__/soroban-envelopes.js";
import { decodeTransactionEnvelope } from "../envelope.js";

const decode = (xdrBase64: string) => decodeTransactionEnvelope(xdrBase64, "testnet").decoded;

describe("unsupported operations", () => {
  it.each([
    ["invokeHostFunction", "soroban"],
    ["extendFootprintTtl", "soroban"],
    ["restoreFootprint", "soroban"],
    ["inflation", "obsolete"],
  ])("decodes %s to a minimal unsupported op (%s)", (opType, reason) => {
    const build = UNSUPPORTED_OPS[opType];
    if (build === undefined) throw new Error(`no builder for ${opType}`);
    expect(decode(envelopeWith(build())).operations).toEqual([
      { kind: "unsupported", opType, reason, source: null },
    ]);
  });
});
