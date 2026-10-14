import { describe, expect, it } from "vitest";
import {
  ERROR_CODES,
  StellixError,
  isErrorCode,
  sanitizeErrorDetails,
  toStellixError,
} from "../errors.js";

describe("StellixError", () => {
  it("carries code, message and retryable flag", () => {
    const err = new StellixError("NETWORK_ERROR", "Horizon unreachable", true);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("StellixError");
    expect(err.code).toBe("NETWORK_ERROR");
    expect(err.message).toBe("Horizon unreachable");
    expect(err.retryable).toBe(true);
  });

  it("defaults retryable to false", () => {
    expect(new StellixError("LOCKED", "Wallet is locked").retryable).toBe(false);
  });
});

describe("ERROR_CODES", () => {
  it("has no duplicates", () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });

  it("isErrorCode accepts members and rejects everything else", () => {
    expect(isErrorCode("INTERNAL_ERROR")).toBe(true);
    expect(isErrorCode("NOT_A_CODE")).toBe(false);
    expect(isErrorCode(42)).toBe(false);
  });
});

describe("toStellixError", () => {
  it("passes StellixError through unchanged", () => {
    const err = new StellixError("INVALID_REQUEST", "bad payload");
    expect(toStellixError(err)).toBe(err);
  });

  it("maps unknown errors to INTERNAL_ERROR without copying their content", () => {
    const leaky = new Error("abandon abandon abandon ... secret words");
    leaky.cause = { secret: "S..." };
    const mapped = toStellixError(leaky);
    expect(mapped.code).toBe("INTERNAL_ERROR");
    expect(mapped.message).not.toContain("abandon");
    expect(mapped.cause).toBeUndefined();
    expect(Object.keys(mapped)).not.toContain("secret");
  });

  it("maps non-Error values to INTERNAL_ERROR", () => {
    expect(toStellixError("boom").code).toBe("INTERNAL_ERROR");
    expect(toStellixError(undefined).code).toBe("INTERNAL_ERROR");
  });
});

describe("error details (allowlisted per code)", () => {
  it("keeps declared keys and strips everything else", () => {
    const err = new StellixError("INSUFFICIENT_BALANCE", "m", false, {
      maxSendableStroops: "100",
      secret: "S…",
    });
    expect(err.details).toEqual({ maxSendableStroops: "100" });
  });

  it("codes without declared keys carry no details", () => {
    expect(
      new StellixError("LOCKED", "m", false, { maxSendableStroops: "1" }).details,
    ).toBeUndefined();
  });

  it("non-string values are dropped", () => {
    expect(sanitizeErrorDetails("INSUFFICIENT_BALANCE", { maxSendableStroops: 5 })).toBeUndefined();
  });
});
