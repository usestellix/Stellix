import { describe, expect, it } from "vitest";
import { encodePayRequest } from "../sep7.js";

// The spec publishes examples, not test vectors. These are its `pay` examples, copied verbatim
// from sep-0007.md @ af35d0c (line 243), minus params Stellix never emits (`msg`).
const SPEC_DEST = "GCALNQQBXAPZ2WIRSDDBMSTAKCUH5SG6U76YBFLQLIXJTF7FE5AX7AOO";
const SPEC_PAY =
  "web+stellar:pay?destination=GCALNQQBXAPZ2WIRSDDBMSTAKCUH5SG6U76YBFLQLIXJTF7FE5AX7AOO&amount=120.1234567&memo=skdjfasf&memo_type=MEMO_TEXT&msg=pay%20me%20with%20lumens";
const TESTNET = "&network_passphrase=Test%20SDF%20Network%20%3B%20September%202015";

describe("encodePayRequest (SEP-7 pay)", () => {
  it("matches the spec's pay example on mainnet (no network_passphrase)", () => {
    expect(
      encodePayRequest({
        destination: SPEC_DEST,
        amountStroops: 1_201_234_567n,
        memo: { type: "text", value: "skdjfasf" },
        network: "mainnet",
      }),
    ).toBe(SPEC_PAY.replace("&msg=pay%20me%20with%20lumens", ""));
  });

  it("adds the URL-encoded passphrase on testnet (required off the public network)", () => {
    expect(encodePayRequest({ destination: SPEC_DEST, network: "testnet" })).toBe(
      `web+stellar:pay?destination=${SPEC_DEST}${TESTNET}`,
    );
  });

  it("omits amount and memo when absent; trims trailing zeros from the amount", () => {
    expect(
      encodePayRequest({ destination: SPEC_DEST, amountStroops: 125_000_000n, network: "mainnet" }),
    ).toBe(`web+stellar:pay?destination=${SPEC_DEST}&amount=12.5`);
    expect(
      encodePayRequest({
        destination: SPEC_DEST,
        memo: { type: "text", value: "" },
        network: "mainnet",
      }),
    ).toBe(`web+stellar:pay?destination=${SPEC_DEST}`);
  });

  it("percent-encodes memo text (spaces as %20, RFC 3986 reserved and UTF-8)", () => {
    const uri = encodePayRequest({
      destination: SPEC_DEST,
      memo: { type: "text", value: "a b&c=d!'()*é" },
      network: "mainnet",
    });
    expect(uri).toBe(
      `web+stellar:pay?destination=${SPEC_DEST}&memo=a%20b%26c%3Dd%21%27%28%29%2A%C3%A9&memo_type=MEMO_TEXT`,
    );
    expect(decodeURIComponent(new URL(uri).searchParams.get("memo") ?? "")).toBe("a b&c=d!'()*é");
  });

  it("emits MEMO_ID with the canonical integer", () => {
    expect(
      encodePayRequest({
        destination: SPEC_DEST,
        memo: { type: "id", value: "009001" },
        network: "mainnet",
      }),
    ).toBe(`web+stellar:pay?destination=${SPEC_DEST}&memo=9001&memo_type=MEMO_ID`);
  });

  it.each([
    [
      "a muxed destination",
      { destination: "MA7CVQDHVFZPKCTZFGJTWSXXSS772TMH6IZYVRR6OEWGRUFKRE7QGAAAAAAAABTZGIAUM" },
      "INVALID_ADDRESS",
    ],
    ["a non-address", { destination: "hello" }, "INVALID_ADDRESS"],
    ["a zero amount", { amountStroops: 0n }, "INVALID_AMOUNT"],
    ["a negative amount", { amountStroops: -1n }, "INVALID_AMOUNT"],
    ["memo text over 28 bytes", { memo: { type: "text", value: "x".repeat(29) } }, "MEMO_TOO_LONG"],
    ["a non-numeric memo ID", { memo: { type: "id", value: "12a" } }, "INVALID_MEMO_ID"],
    [
      "a memo ID over 2^64-1",
      { memo: { type: "id", value: (2n ** 64n).toString() } },
      "INVALID_MEMO_ID",
    ],
  ] as const)("rejects %s", (_name, patch, code) => {
    expect(() =>
      encodePayRequest({ destination: SPEC_DEST, network: "testnet", ...patch }),
    ).toThrow(expect.objectContaining({ code }) as Error);
  });
});
