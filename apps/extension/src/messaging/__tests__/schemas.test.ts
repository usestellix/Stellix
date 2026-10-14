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
    const ok = {
      hasVault: true,
      unlocked: false,
      network: "testnet",
      activeAccountIndex: 0,
      inflight: [],
    };
    expect(def.result.safeParse(ok).success).toBe(true);
    expect(def.result.safeParse({ ...ok, activeAccountIndex: null }).success).toBe(true);
  });

  it.each([
    ["unknown network", { network: "devnet" }],
    ["negative index", { activeAccountIndex: -1 }],
    ["fractional index", { activeAccountIndex: 1.5 }],
    ["extra field", { mnemonic: "abandon" }],
  ])("rejects result with %s", (_name, patch) => {
    const base = {
      hasVault: true,
      unlocked: false,
      network: "testnet",
      activeAccountIndex: 0,
      inflight: [],
    };
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

  it("only the passive reads are excluded from activity (ARCHITECTURE §5 step 4)", () => {
    const passive = Object.entries(REQUESTS)
      .filter(([, d]) => !d.countsAsActivity)
      .map(([t]) => t);
    expect(passive).toEqual(["GET_STATUS", "GET_SETTINGS"]);
  });
});

describe("payload schemas for every request type", () => {
  const cases: Record<keyof typeof REQUESTS, { valid: unknown[]; invalid: unknown[] }> = {
    GET_STATUS: { valid: [undefined], invalid: [{}, null] },
    ONBOARD_GENERATE: { valid: [undefined], invalid: [{}] },
    ONBOARD_CREATE: {
      valid: [{ password: "pw", answers: [{ position: 2, word: "abandon" }] }],
      invalid: [
        { password: "pw" },
        { password: "", answers: [] },
        { password: "pw", answers: [{ position: -1, word: "x" }] },
        { password: "pw", answers: [{ position: 1, word: "x" }], verifiedIndices: [1] },
        {
          password: "pw",
          answers: Array.from({ length: 4 }, (_, i) => ({ position: i, word: "x" })),
        },
      ],
    },
    ONBOARD_IMPORT: {
      valid: [{ mnemonic: "abandon about", password: "pw" }],
      invalid: [{ mnemonic: "x".repeat(1025), password: "pw" }, { mnemonic: "x" }],
    },
    UNLOCK: {
      valid: [{ password: "pw" }],
      invalid: [{ password: "" }, { password: 1 }, undefined],
    },
    LOCK: { valid: [undefined], invalid: [{}] },
    LIST_ACCOUNTS: { valid: [undefined], invalid: [{}] },
    ADD_ACCOUNT: {
      valid: [{}, { label: "Savings" }],
      invalid: [undefined, { label: 1 }, { label: "x".repeat(65) }],
    },
    RENAME_ACCOUNT: {
      valid: [{ index: 0, label: "Main" }],
      invalid: [{ index: -1, label: "x" }, { index: 1.5, label: "x" }, { index: 0 }],
    },
    SET_ACTIVE_ACCOUNT: { valid: [{ index: 3 }], invalid: [{ index: "3" }, { index: 2 ** 31 }] },
    REVEAL_PHRASE: { valid: [{ password: "pw" }], invalid: [{}, { password: "" }] },
    CHANGE_PASSWORD: {
      valid: [{ current: "a", next: "b" }],
      invalid: [{ current: "a" }, { current: "", next: "b" }],
    },
    RESET_WALLET: { valid: [{ confirmation: "RESET" }], invalid: [{ confirmation: "reset" }, {}] },
    GET_SETTINGS: { valid: [undefined], invalid: [{}] },
    SET_SETTINGS: {
      valid: [
        {},
        { network: "mainnet", acknowledgedRealFunds: true },
        { autoLockMinutes: 30 },
        { horizonOverride: { network: "testnet", url: "https://h.example" } },
        { horizonOverride: { network: "mainnet", url: null } },
      ],
      invalid: [
        { network: "devnet" },
        { autoLockMinutes: 7 },
        { horizonOverride: { network: "testnet" } },
        { horizonOverride: { network: "testnet", url: "x".repeat(2049) } },
        { network: "mainnet", acknowledgedRealFunds: "yes" },
        { theme: "dark" },
      ],
    },
    DISCOVER_ACCOUNTS: { valid: [undefined], invalid: [{}] },
    PREPARE_PAYMENT: {
      valid: [
        { destination: "GABC", amount: "1" },
        { destination: "GABC", amount: "1", memo: { type: "id", value: "7" } },
      ],
      invalid: [
        { destination: "GABC" },
        { destination: "GABC", amount: "1", memo: { type: "hash", value: "x" } },
        { destination: "x".repeat(129), amount: "1" },
        { destination: "GABC", amount: "1", xdr: "AAAA" },
      ],
    },
    CONFIRM_PAYMENT: {
      valid: [{ preparedId: "a".repeat(32) }],
      invalid: [{ preparedId: "xyz" }, { preparedId: "a".repeat(32), xdr: "AAAA" }, {}],
    },
    CANCEL_PAYMENT: { valid: [{ preparedId: "0".repeat(32) }], invalid: [{}] },
    DISMISS_OUTCOME: { valid: [{ hash: "f".repeat(64) }], invalid: [{ hash: "nothex" }] },
  };

  for (const [type, { valid, invalid }] of Object.entries(cases)) {
    const schema = REQUESTS[type as keyof typeof REQUESTS].payload;
    it.each(valid)(`${type} accepts %j`, (payload) => {
      expect(schema.safeParse(payload).success).toBe(true);
    });
    it.each(invalid)(`${type} rejects %j`, (payload) => {
      expect(schema.safeParse(payload).success).toBe(false);
    });
  }
});

describe("result schemas", () => {
  it("REVEAL_PHRASE and ONBOARD_GENERATE only return words in the shapes we expect", () => {
    expect(
      REQUESTS.ONBOARD_GENERATE.result.safeParse({ words: ["a"], verifyPositions: [1, 2, 3] })
        .success,
    ).toBe(false);
    expect(REQUESTS.REVEAL_PHRASE.result.safeParse({ words: [], extra: 1 }).success).toBe(false);
  });

  it("void results accept a missing data key in the response envelope", () => {
    expect(responseSchema.safeParse({ id: ID, ok: true }).success).toBe(true);
  });
});

describe("error details cross messaging only as declared (ERROR_DETAIL_KEYS)", () => {
  it("keeps INSUFFICIENT_BALANCE.maxSendableStroops and strips everything else", () => {
    const parsed = responseSchema.parse({
      id: ID,
      ok: false,
      error: {
        code: "INSUFFICIENT_BALANCE",
        message: "m",
        details: { maxSendableStroops: "5", mnemonic: "abandon" },
      },
    });
    expect(parsed).toEqual({
      id: ID,
      ok: false,
      error: { code: "INSUFFICIENT_BALANCE", message: "m", details: { maxSendableStroops: "5" } },
    });
  });

  it("drops details entirely for codes that declare none", () => {
    expect(
      responseSchema.parse({
        id: ID,
        ok: false,
        error: { code: "LOCKED", message: "m", details: { a: "b" } },
      }),
    ).toEqual({
      id: ID,
      ok: false,
      error: { code: "LOCKED", message: "m" },
    });
  });
});
