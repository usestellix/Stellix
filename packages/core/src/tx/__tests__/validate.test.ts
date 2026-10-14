import { describe, expect, it } from "vitest";
import { selectOperation } from "../select-op.js";
import { memoTextBytes, validatePayment } from "../validate.js";
import { testAddresses } from "./addresses.js";

const { source, dest, muxedDest, muxedSelf } = testAddresses();
const S = source.publicKey();

function code(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (err: unknown) {
    return (err as { code?: string }).code;
  }
}

describe("validatePayment (every row of TRANSACTIONS §2)", () => {
  it("accepts a G destination, trims, and parses the amount", () => {
    expect(validatePayment({ destination: `  ${dest.publicKey()} `, amount: "1.5" }, S)).toEqual({
      destination: dest.publicKey(),
      destinationBase: dest.publicKey(),
      muxed: false,
      amountStroops: 15_000_000n,
      memo: { type: "none" },
    });
  });

  it("decodes an M destination to its base account", () => {
    expect(validatePayment({ destination: muxedDest, amount: "1" }, S)).toMatchObject({
      destination: muxedDest,
      destinationBase: dest.publicKey(),
      muxed: true,
    });
  });

  it.each([
    ["garbage", "not-an-address", "INVALID_ADDRESS"],
    [
      "bad checksum",
      `${dest.publicKey().slice(0, -1)}${dest.publicKey().endsWith("A") ? "B" : "A"}`,
      "INVALID_ADDRESS",
    ],
    ["a secret seed", source.secret(), "SECRET_KEY_ENTERED"],
    ["the source itself", S, "SELF_PAYMENT"],
    ["the source's muxed form", muxedSelf, "SELF_PAYMENT"],
  ])("destination: %s → %s", (_n, destination, expected) => {
    expect(code(() => validatePayment({ destination, amount: "1" }, S))).toBe(expected);
  });

  it.each(["0", "0.0000000", "-1", "abc", "1.12345678", ""])(
    "amount %j → INVALID_AMOUNT",
    (amount) => {
      expect(code(() => validatePayment({ destination: dest.publicKey(), amount }, S))).toBe(
        "INVALID_AMOUNT",
      );
    },
  );

  it("memo text: 28 bytes OK, 29 bytes rejected, multibyte counted in bytes", () => {
    const ok = "a".repeat(28);
    expect(
      validatePayment(
        { destination: dest.publicKey(), amount: "1", memo: { type: "text", value: ok } },
        S,
      ).memo,
    ).toEqual({
      type: "text",
      value: ok,
    });
    for (const value of ["a".repeat(29), "😀".repeat(8), "é".repeat(15)]) {
      expect(
        code(() =>
          validatePayment(
            { destination: dest.publicKey(), amount: "1", memo: { type: "text", value } },
            S,
          ),
        ),
      ).toBe("MEMO_TOO_LONG");
    }
    expect(memoTextBytes("😀".repeat(7))).toBe(28);
  });

  it("memo id: 0 and 2^64−1 OK; 2^64, negatives and decimals rejected", () => {
    for (const value of ["0", "18446744073709551615"]) {
      expect(
        validatePayment(
          { destination: dest.publicKey(), amount: "1", memo: { type: "id", value } },
          S,
        ).memo,
      ).toEqual({
        type: "id",
        value,
      });
    }
    for (const value of ["18446744073709551616", "-1", "1.5", "1e3", " 1"]) {
      expect(
        code(() =>
          validatePayment(
            { destination: dest.publicKey(), amount: "1", memo: { type: "id", value } },
            S,
          ),
        ),
      ).toBe("INVALID_MEMO_ID");
    }
  });

  it("memo + M address → MEMO_WITH_MUXED; an empty memo counts as none", () => {
    expect(
      code(() =>
        validatePayment(
          { destination: muxedDest, amount: "1", memo: { type: "text", value: "x" } },
          S,
        ),
      ),
    ).toBe("MEMO_WITH_MUXED");
    expect(
      validatePayment({ destination: muxedDest, amount: "1", memo: { type: "text", value: "" } }, S)
        .memo,
    ).toEqual({ type: "none" });
  });
});

describe("selectOperation (STELLAR_PRIMER §2)", () => {
  it.each([
    [false, true, "payment"],
    [false, false, "createAccount"],
    [true, true, "payment"],
  ] as const)("muxed=%s exists=%s → %s", (muxed, exists, op) => {
    expect(selectOperation(muxed, exists)).toBe(op);
  });

  it("M + not exists → MUXED_DESTINATION_UNFUNDED", () => {
    expect(code(() => selectOperation(true, false))).toBe("MUXED_DESTINATION_UNFUNDED");
  });
});
