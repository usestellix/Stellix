import { Operation } from "@stellar/stellar-sdk/base";
import { describe, expect, it } from "vitest";
import { fixture } from "../../__fixtures__/load.js";
import {
  OTHER,
  PEER,
  USER,
  USER_MUXED,
  analyzeTx,
  buildTx,
  pay,
} from "../../__tests__/build-tx.js";
import { findingCopy } from "../../copy/index.js";
import { evaluate } from "../../policy/policy.js";
import type { AnalysisReport, RuleId } from "../../types.js";

/** The account the accountMerge fixture closes (its transaction source). */
const MERGED = "GDL5RCVVDNPCBFPP2SGNNXTOHVHHGKD5TZNPPQL2MRRKY4RZRIDTOZK3";

const of = (report: AnalysisReport, id: RuleId) => report.findings.filter((f) => f.ruleId === id);

describe("ACCT_MERGE", () => {
  it("fires on the captured merge when the user's account is the one closed", async () => {
    const report = await analyzeTx(fixture("accountMerge").envelopeXdr, { userAccount: MERGED });
    const findings = of(report, "ACCT_MERGE");
    expect(findings).toEqual([
      {
        ruleId: "ACCT_MERGE",
        severity: "critical",
        confidence: "high",
        opIndex: 0,
        evidence: { opNumber: "1", account: MERGED, destination: USER },
      },
    ]);
    expect(findingCopy(findings[0]!).body).toContain(USER);
    // Blocked unless Stellix built it; from Stellix's own flow it needs typing.
    expect(evaluate(report, { origin: "dapp" })).toMatchObject({ state: "blocked" });
    expect(evaluate(report, { origin: "stellix" })).toMatchObject({ requires: "typed" });
  });

  it("fires for a merge sourced by the user's muxed address", async () => {
    const merge = Operation.accountMerge({ destination: PEER, source: USER_MUXED });
    const report = await analyzeTx(buildTx([pay(), merge], { source: OTHER }));
    expect(of(report, "ACCT_MERGE")).toMatchObject([
      { opIndex: 1, evidence: { account: USER_MUXED, destination: PEER } },
    ]);
  });

  it("doesn't fire for the account that receives the merge", async () => {
    const report = await analyzeTx(fixture("accountMerge").envelopeXdr, { userAccount: USER });
    expect(of(report, "ACCT_MERGE")).toEqual([]);
  });
});

describe("FOREIGN_SOURCE_OP", () => {
  it("fires on the captured muxed-source op from the peer's side", async () => {
    // The transaction is the user's; its op is sourced by the peer's muxed address.
    const report = await analyzeTx(fixture("payment-muxed-sources").envelopeXdr, {
      userAccount: PEER,
    });
    const findings = of(report, "FOREIGN_SOURCE_OP");
    expect(findings).toMatchObject([
      {
        severity: "high",
        opIndex: 0,
        evidence: {
          opNumber: "1",
          opType: "payment",
          account: expect.stringMatching(/^M/) as string,
        },
      },
    ]);
    expect(findings[0]!.evidence.txSource).toMatch(/^M/);
    expect(findingCopy(findings[0]!).body).toContain("operation 1 (payment)");
    expect(evaluate(report, { origin: "dapp" })).toMatchObject({ requires: "typed" });
  });

  it("fires on a user-sourced op hidden among another account's ops", async () => {
    const report = await analyzeTx(
      buildTx([pay(PEER), pay(PEER, USER), pay(PEER)], { source: OTHER }),
    );
    expect(of(report, "FOREIGN_SOURCE_OP")).toMatchObject([
      { opIndex: 1, evidence: { account: USER, txSource: OTHER } },
    ]);
  });

  it("detects the user's muxed address as an op source", async () => {
    const report = await analyzeTx(buildTx([pay(PEER, USER_MUXED)], { source: OTHER }));
    expect(of(report, "FOREIGN_SOURCE_OP")).toMatchObject([{ evidence: { account: USER_MUXED } }]);
  });

  it("doesn't fire when the transaction is the user's own", async () => {
    const report = await analyzeTx(buildTx([pay(PEER, USER), pay(PEER)]));
    expect(of(report, "FOREIGN_SOURCE_OP")).toEqual([]);
  });

  it("doesn't fire when someone else fee-bumps the user's transaction", async () => {
    const report = await analyzeTx(fixture("feeBump").envelopeXdr);
    expect(of(report, "FOREIGN_SOURCE_OP")).toEqual([]);
  });

  it("doesn't fire for ops sourced by other accounts", async () => {
    const report = await analyzeTx(buildTx([pay(PEER), pay(USER, PEER)], { source: OTHER }));
    expect(of(report, "FOREIGN_SOURCE_OP")).toEqual([]);
  });
});
