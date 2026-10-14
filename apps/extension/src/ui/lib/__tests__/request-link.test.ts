import { describe, expect, it } from "vitest";
import { requestLink } from "../request-link.js";

const ME = "GCALNQQBXAPZ2WIRSDDBMSTAKCUH5SG6U76YBFLQLIXJTF7FE5AX7AOO";
const draft = (amount: string, memo = "", memoType: "text" | "id" = "text") => ({
  amount,
  memo,
  memoType,
});

describe("requestLink", () => {
  it("no amount yet → empty (the QR shows no link)", () => {
    expect(requestLink(ME, "testnet", draft("  "))).toEqual({ kind: "empty" });
  });

  it("builds the SEP-7 link with amount, memo and the testnet passphrase", () => {
    expect(requestLink(ME, "testnet", draft(" 12.50 ", "inv 7"))).toEqual({
      kind: "ok",
      amountStroops: 125_000_000n,
      uri: `web+stellar:pay?destination=${ME}&amount=12.5&memo=inv%207&memo_type=MEMO_TEXT&network_passphrase=Test%20SDF%20Network%20%3B%20September%202015`,
    });
  });

  it.each([
    ["abc", "", "text", "amount", "INVALID_AMOUNT"],
    ["0", "", "text", "amount", "INVALID_AMOUNT"],
    ["1.12345678", "", "text", "amount", "INVALID_AMOUNT"],
    ["1", "x".repeat(29), "text", "memo", "MEMO_TOO_LONG"],
    ["1", "-5", "id", "memo", "INVALID_MEMO_ID"],
  ] as const)("%s / %s (%s) → %s error %s", (amount, memo, type, field, code) => {
    expect(requestLink(ME, "mainnet", draft(amount, memo, type))).toEqual({
      kind: "error",
      field,
      code,
    });
  });
});
