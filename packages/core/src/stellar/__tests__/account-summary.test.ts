import { describe, expect, it } from "vitest";
import { accountSchema, type AccountRecord } from "../../network/horizon-schemas.js";
import { fixture } from "../../network/__tests__/fixtures.js";
import { isMultisig, summarizeAccount } from "../account-summary.js";
import { isAccountId, isMuxedAddress, looksLikeSecretSeed } from "../address.js";

const BASE = 5_000_000n;
const funded = () => accountSchema.parse(fixture("account-funded").body);
const multi = () => accountSchema.parse(fixture("account-multi-subentry").body);

describe("summarizeAccount (captured testnet fixtures)", () => {
  it("unfunded", () => {
    expect(summarizeAccount(null, BASE)).toEqual({ funded: false });
  });

  it("freshly funded: 1 XLM reserved, the rest available", () => {
    expect(summarizeAccount(funded(), BASE)).toEqual({
      funded: true,
      totalStroops: 100_000_000_000n,
      reservedStroops: 10_000_000n,
      availableStroops: 99_990_000_000n,
      minimumBalanceStroops: 10_000_000n,
      multisig: false,
    });
  });

  it("multi-subentry: (2 + 2) × 0.5 = 2 XLM reserved, and flagged multisig", () => {
    const summary = summarizeAccount(multi(), BASE);
    expect(summary).toMatchObject({
      funded: true,
      totalStroops: 99_999_999_800n,
      minimumBalanceStroops: 20_000_000n,
      reservedStroops: 20_000_000n,
      availableStroops: 99_979_999_800n,
      multisig: true,
    });
  });

  it("counts selling liabilities as reserved", () => {
    const a = funded() as AccountRecord & { balances: { selling_liabilities: string }[] };
    a.balances[0]!.selling_liabilities = "100.0000000";
    const summary = summarizeAccount(a, BASE);
    expect(summary).toMatchObject({
      reservedStroops: 1_010_000_000n,
      availableStroops: 98_990_000_000n,
    });
  });

  it("a funded account with no native balance is a bad response", () => {
    const a = { ...funded(), balances: [] };
    expect(() => summarizeAccount(a, BASE)).toThrow(
      expect.objectContaining({ code: "HORIZON_BAD_RESPONSE" }),
    );
  });
});

describe("isMultisig (NETWORK.md §4)", () => {
  it("single own signer, zero thresholds → supported", () => {
    expect(isMultisig(funded())).toBe(false);
  });

  it("thresholds ≤ 1 with the single signer → still supported", () => {
    expect(
      isMultisig({
        ...funded(),
        thresholds: { low_threshold: 1, med_threshold: 1, high_threshold: 1 },
      }),
    ).toBe(false);
  });

  it("raised threshold → multisig", () => {
    expect(
      isMultisig({
        ...funded(),
        thresholds: { low_threshold: 0, med_threshold: 2, high_threshold: 0 },
      }),
    ).toBe(true);
  });

  it("master weight 0 or a foreign sole signer → multisig", () => {
    const a = funded();
    expect(isMultisig({ ...a, signers: [{ ...a.signers[0]!, weight: 0 }] })).toBe(true);
    expect(isMultisig({ ...a, signers: [{ ...a.signers[0]!, key: multi().id }] })).toBe(true);
  });
});

describe("address checks", () => {
  it("validates by checksum", () => {
    const id = funded().id;
    expect(isAccountId(id)).toBe(true);
    expect(isAccountId(`${id.slice(0, -1)}${id.endsWith("A") ? "B" : "A"}`)).toBe(false);
    expect(isMuxedAddress(id)).toBe(false);
    expect(looksLikeSecretSeed(id)).toBe(false);
  });
});
