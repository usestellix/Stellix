import { describe, expect, it } from "vitest";
import { REQUESTS, REQUEST_TYPES, requestEnvelopeSchema, responseSchema } from "../protocol.js";

const ID = "8f14e45f-ceea-4e7a-9b7b-2b7f5d0f3c11";

describe("request envelope", () => {
  it("accepts a well-formed GET_STATUS request with or without a payload key", () => {
    expect(
      requestEnvelopeSchema.safeParse({ id: ID, type: "GET_STATUS", payload: undefined }).success,
    ).toBe(true);
    expect(requestEnvelopeSchema.safeParse({ id: ID, type: "GET_STATUS" }).success).toBe(true);
  });

  it.each([
    ["unknown type", { id: ID, type: "SIGN_ANYTHING", payload: undefined }],
    ["missing id", { type: "GET_STATUS" }],
    ["non-uuid id", { id: "1", type: "GET_STATUS" }],
    ["extra keys", { id: ID, type: "GET_STATUS", payload: undefined, xdr: "AAAA" }],
    ["not an object", "GET_STATUS"],
    ["null", null],
  ])("rejects %s", (_name, message) => {
    expect(requestEnvelopeSchema.safeParse(message).success).toBe(false);
  });
});

describe("GET_STATUS schemas", () => {
  const def = REQUESTS.GET_STATUS;

  it("payload must be absent", () => {
    expect(def.payload.safeParse(undefined).success).toBe(true);
    expect(def.payload.safeParse({}).success).toBe(false);
    expect(def.payload.safeParse(null).success).toBe(false);
  });

  it("accepts valid results", () => {
    const ok = { hasVault: true, unlocked: false, network: "testnet", activeAccountIndex: 0 };
    expect(def.result.safeParse(ok).success).toBe(true);
    expect(def.result.safeParse({ ...ok, activeAccountIndex: null }).success).toBe(true);
  });

  it.each([
    ["unknown network", { network: "devnet" }],
    ["negative index", { activeAccountIndex: -1 }],
    ["fractional index", { activeAccountIndex: 1.5 }],
    ["extra field", { mnemonic: "abandon" }],
  ])("rejects result with %s", (_name, patch) => {
    const base = { hasVault: true, unlocked: false, network: "testnet", activeAccountIndex: 0 };
    expect(def.result.safeParse({ ...base, ...patch }).success).toBe(false);
  });
});

describe("response envelope", () => {
  it("accepts ok and error responses", () => {
    expect(responseSchema.safeParse({ id: ID, ok: true, data: 1 }).success).toBe(true);
    expect(
      responseSchema.safeParse({ id: ID, ok: false, error: { code: "LOCKED", message: "m" } })
        .success,
    ).toBe(true);
  });

  it("rejects unknown error codes", () => {
    expect(
      responseSchema.safeParse({ id: ID, ok: false, error: { code: "NOPE", message: "m" } })
        .success,
    ).toBe(false);
  });
});

describe("registry", () => {
  it("defines every request type", () => {
    expect(Object.keys(REQUESTS).sort()).toEqual([...REQUEST_TYPES].sort());
  });

  it("GET_STATUS does not count as activity", () => {
    expect(REQUESTS.GET_STATUS.countsAsActivity).toBe(false);
  });
});
