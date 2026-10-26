import { Asset, Claimant, Operation } from "@stellar/stellar-sdk/base";
import { describe, expect, it } from "vitest";
import { FakeHorizonClient } from "../../../testing/fake-horizon.js";
import { fixture } from "../../__fixtures__/load.js";
import {
  OTHER,
  PEER,
  USER,
  analyzeTx,
  buildTx,
  horizonWithBaseReserve,
} from "../../__tests__/build-tx.js";
import { findingCopy } from "../../copy/index.js";
import type { AnalysisReport, RuleId } from "../../types.js";

/** The account sponsorship-entries sponsors (it creates the entries). */
const SPONSORED = "GBVUE57PFI4Z37X2R6X2IKKQ2BIQCKFFARLG2SWIBK22CKPARHUAEFEM";
/** The account sponsorship-create-account creates. */
const NEW_ACCOUNT = "GDLDBGWQOA6FFWJMXIXYEZDWIYK7BM7VHFCRYGYF67C2BRMR7JGVKID3";

const of = (report: AnalysisReport, id: RuleId) => report.findings.filter((f) => f.ruleId === id);

const claimable = (...claimants: string[]) =>
  Operation.createClaimableBalance({
    asset: Asset.native(),
    amount: "5",
    claimants: claimants.map((c) => new Claimant(c)),
  });

describe("CLAIMABLE_TO_OTHER", () => {
  it("fires when the user locks a balance only others can claim", async () => {
    const report = await analyzeTx(buildTx([claimable(PEER, OTHER)]));
    const findings = of(report, "CLAIMABLE_TO_OTHER");
    expect(findings).toEqual([
      {
        ruleId: "CLAIMABLE_TO_OTHER",
        severity: "medium",
        confidence: "high",
        opIndex: 0,
        evidence: { opNumber: "1", amount: "5 XLM", claimants: `${PEER}, ${OTHER}` },
      },
    ]);
    expect(findingCopy(findings[0]!).body).toContain(`only ${PEER}, ${OTHER} can claim`);
  });

  it("fires on the captured claimable balance from its creator's side", async () => {
    // sponsorship-entries: SPONSORED creates a balance only PEER can claim.
    const report = await analyzeTx(fixture("sponsorship-entries").envelopeXdr, {
      userAccount: SPONSORED,
      horizon: horizonWithBaseReserve(),
    });
    expect(of(report, "CLAIMABLE_TO_OTHER")).toMatchObject([
      { opIndex: 6, evidence: { amount: "1 XLM", claimants: PEER } },
    ]);
  });

  it("doesn't fire when the user is among the claimants", async () => {
    const report = await analyzeTx(fixture("createClaimableBalance").envelopeXdr);
    expect(of(report, "CLAIMABLE_TO_OTHER")).toEqual([]);
  });

  it("doesn't fire for a balance another account creates", async () => {
    const report = await analyzeTx(buildTx([claimable(PEER)], { source: OTHER }));
    expect(of(report, "CLAIMABLE_TO_OTHER")).toEqual([]);
  });
});

describe("SPONSORSHIP_CHANGE", () => {
  async function changes(
    name: string,
    userAccount = USER,
  ): Promise<Record<string, string | number | undefined>[]> {
    const report = await analyzeTx(fixture(name).envelopeXdr, {
      userAccount,
      horizon: horizonWithBaseReserve(),
    });
    return of(report, "SPONSORSHIP_CHANGE").map((f) => ({ opIndex: f.opIndex, ...f.evidence }));
  }

  it("reports the user sponsoring a new account, with its 2 base reserves", async () => {
    const findings = await changes("sponsorship-create-account");
    expect(findings).toEqual([
      {
        opIndex: 0,
        opNumber: "1",
        entry: `new entries of ${NEW_ACCOUNT}`,
        reserveEntries: "2",
        reserveAmount: "1",
        reserveStroops: "10000000",
        payer: `your account ${USER}`,
      },
    ]);
  });

  it("counts every entry the sponsored account creates in its sandwich", async () => {
    // Two trustlines, a data entry, a signer, an offer and a one-claimant balance.
    expect(await changes("sponsorship-entries")).toMatchObject([
      { opIndex: 0, reserveEntries: "6", reserveAmount: "3", payer: `your account ${USER}` },
    ]);
  });

  it("reports someone else sponsoring the user's new entries, from the user's side", async () => {
    expect(await changes("sponsorship-entries", SPONSORED)).toMatchObject([
      { entry: `new entries of ${SPONSORED}`, reserveEntries: "6", payer: USER },
    ]);
  });

  it.each([
    ["revokeSponsorship-account", "2", NEW_ACCOUNT],
    ["revokeSponsorship-trustline", "1", SPONSORED],
    ["revokeSponsorship-data", "1", SPONSORED],
    ["revokeSponsorship-offer", "1", SPONSORED],
    ["revokeSponsorship-signer", "1", SPONSORED],
  ])("reports %s: the reserve goes back to the entry's owner", async (name, entries, owner) => {
    const [finding] = await changes(name);
    expect(finding).toMatchObject({ reserveEntries: entries, payer: owner });
    expect(finding?.entry).toContain(owner);
  });

  it("reports a revoke inside another sponsor's sandwich as a transfer to that sponsor", async () => {
    // The peer begins sponsoring the user; the user revokes its claimable-balance sponsorship.
    expect(await changes("revokeSponsorship-claimable-balance")).toMatchObject([
      {
        opIndex: 1,
        entry: expect.stringMatching(/^the claimable balance B/) as string,
        payer: PEER,
      },
    ]);
  });

  it("reports nothing for sponsorships between other accounts", async () => {
    expect(await changes("sponsorship-create-account", PEER)).toEqual([]);
    expect(await changes("payment-native")).toEqual([]);
  });

  it("is unavailable when the base reserve can't be read, and never reads it otherwise", async () => {
    const without = new FakeHorizonClient();
    const affected = await analyzeTx(fixture("sponsorship-create-account").envelopeXdr, {
      horizon: without,
    });
    expect(
      affected.checksUnavailable.filter((c) => c.ruleId === "SPONSORSHIP_CHANGE"),
    ).toHaveLength(1);
    const unaffected = await analyzeTx(fixture("payment-native").envelopeXdr, { horizon: without });
    expect(unaffected.checksUnavailable).toEqual([]);
  });
});
