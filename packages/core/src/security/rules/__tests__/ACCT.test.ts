import { Operation } from "@stellar/stellar-sdk/base";
import { describe, expect, it } from "vitest";
import { FakeHorizonClient } from "../../../testing/fake-horizon.js";
import { fixture } from "../../__fixtures__/load.js";
import {
  OTHER,
  USER,
  USER_MUXED,
  accountRecord,
  analyzeTx,
  buildTx,
  pay,
} from "../../__tests__/build-tx.js";
import { findingCopy } from "../../copy/index.js";
import { evaluate } from "../../policy/policy.js";
import type { AnalysisReport, RuleId } from "../../types.js";

const SIGNER = "GBUBOPHZEGSYI3ORSOOK2UZMIVES7YZXZOFBFRX2ZGBL44DYFOE4RE3S";
/** Source of the captured setOptions fixtures. */
const SETOPTIONS_ACCOUNT = "GC45EECY44M3YT5ZG4Z4HIQHAALDCGN72N6XLYOKW7UN7O54W6YABBMI";

const of = (report: AnalysisReport, id: RuleId) => report.findings.filter((f) => f.ruleId === id);
const unavailable = (report: AnalysisReport, id: RuleId) =>
  report.checksUnavailable.filter((c) => c.ruleId === id);

const addSigner = (source?: string, weight = 1) =>
  Operation.setOptions({
    signer: { ed25519PublicKey: SIGNER, weight },
    ...(source === undefined ? {} : { source }),
  });

function horizonWith(...records: ReturnType<typeof accountRecord>[]) {
  const horizon = new FakeHorizonClient();
  for (const r of records) horizon.accounts.set(r.id, r);
  return horizon;
}

describe("ACCT_SIGNER_CHANGE", () => {
  it("fires on the captured signer add when the user is its source", async () => {
    const report = await analyzeTx(fixture("setOptions-signer-ed25519").envelopeXdr, {
      userAccount: SETOPTIONS_ACCOUNT,
    });
    const [finding] = of(report, "ACCT_SIGNER_CHANGE");
    expect(finding).toMatchObject({
      severity: "critical",
      opIndex: 0,
      evidence: { opNumber: "1", account: SETOPTIONS_ACCOUNT, weight: "1" },
    });
    expect(findingCopy(finding!).body).toContain(finding!.evidence.signerKey);
    // §12: from a dapp (and so in a pasted report) a signer change is blocked, no override.
    expect(evaluate(report, { origin: "dapp" })).toMatchObject({
      state: "blocked",
      overridable: false,
    });
  });

  it("fires on a signer add hidden among payments", async () => {
    const report = await analyzeTx(buildTx([pay(), pay(), addSigner(), pay()]));
    expect(of(report, "ACCT_SIGNER_CHANGE")).toMatchObject([
      { opIndex: 2, evidence: { opNumber: "3", signerKey: SIGNER, account: USER } },
    ]);
  });

  it("fires when the op names the user's muxed address as its source", async () => {
    const report = await analyzeTx(buildTx([addSigner(USER_MUXED)], { source: OTHER }));
    expect(of(report, "ACCT_SIGNER_CHANGE")).toMatchObject([{ evidence: { account: USER_MUXED } }]);
  });

  it("doesn't fire for a signer change on another account", async () => {
    // The user is USER; the captured op changes SETOPTIONS_ACCOUNT.
    const report = await analyzeTx(fixture("setOptions-signer-ed25519").envelopeXdr);
    expect(of(report, "ACCT_SIGNER_CHANGE")).toEqual([]);
  });

  it("doesn't fire for a signer removal (weight 0)", async () => {
    const report = await analyzeTx(fixture("setOptions-signer-remove").envelopeXdr, {
      userAccount: SETOPTIONS_ACCOUNT,
    });
    expect(of(report, "ACCT_SIGNER_CHANGE")).toEqual([]);
  });

  it("doesn't fire on a plain payment", async () => {
    const report = await analyzeTx(fixture("payment-native").envelopeXdr);
    expect(of(report, "ACCT_SIGNER_CHANGE")).toEqual([]);
  });
});

describe("ACCT_MASTER_WEIGHT", () => {
  const setOptions = (opts: Parameters<typeof Operation.setOptions>[0]) =>
    Operation.setOptions(opts);

  it("fires when the master weight drops to 0", async () => {
    const report = await analyzeTx(buildTx([pay(), setOptions({ masterWeight: 0 })]), {
      horizon: horizonWith(accountRecord(USER)),
    });
    const findings = of(report, "ACCT_MASTER_WEIGHT");
    expect(findings).toEqual([
      {
        ruleId: "ACCT_MASTER_WEIGHT",
        severity: "critical",
        confidence: "high",
        opIndex: 1,
        evidence: {
          opNumber: "2",
          account: USER,
          masterWeightBefore: "1",
          masterWeightAfter: "0",
          highestThresholdAfter: "0",
        },
      },
    ]);
    expect(findingCopy(findings[0]!).body).toContain(USER);
    expect(evaluate(report, { origin: "stellix" })).toMatchObject({ state: "blocked" });
  });

  it("fires when a threshold is raised above the master weight", async () => {
    const report = await analyzeTx(buildTx([setOptions({ highThreshold: 5 })]), {
      horizon: horizonWith(accountRecord(USER, { masterWeight: 1 })),
    });
    expect(of(report, "ACCT_MASTER_WEIGHT")).toMatchObject([
      { evidence: { masterWeightAfter: "1", highestThresholdAfter: "5" } },
    ]);
  });

  it("doesn't fire on the captured setOptions that sets weight 10 over thresholds 1/2/3", async () => {
    const report = await analyzeTx(fixture("setOptions-account-fields").envelopeXdr, {
      userAccount: SETOPTIONS_ACCOUNT,
      horizon: horizonWith(accountRecord(SETOPTIONS_ACCOUNT)),
    });
    expect(of(report, "ACCT_MASTER_WEIGHT")).toEqual([]);
  });

  it("doesn't fire when the change keeps the master key in control", async () => {
    const report = await analyzeTx(
      buildTx([setOptions({ masterWeight: 5, highThreshold: 5, medThreshold: 2 })]),
      { horizon: horizonWith(accountRecord(USER)) },
    );
    expect(of(report, "ACCT_MASTER_WEIGHT")).toEqual([]);
  });

  it("doesn't fire for a weight change on another account", async () => {
    const report = await analyzeTx(buildTx([setOptions({ masterWeight: 0 })], { source: OTHER }), {
      horizon: horizonWith(accountRecord(OTHER)),
    });
    expect(of(report, "ACCT_MASTER_WEIGHT")).toEqual([]);
    expect(unavailable(report, "ACCT_MASTER_WEIGHT")).toEqual([]);
  });

  it("doesn't fire when a later op restores control", async () => {
    const report = await analyzeTx(
      buildTx([setOptions({ highThreshold: 5 }), setOptions({ masterWeight: 5 })]),
      { horizon: horizonWith(accountRecord(USER)) },
    );
    expect(of(report, "ACCT_MASTER_WEIGHT")).toEqual([]);
  });

  it("doesn't fire for an account that was already multisig", async () => {
    const report = await analyzeTx(buildTx([setOptions({ masterWeight: 0 })]), {
      horizon: horizonWith(accountRecord(USER, { masterWeight: 1, high: 2 })),
    });
    expect(of(report, "ACCT_MASTER_WEIGHT")).toEqual([]);
  });

  it("is unavailable (and so blocks) when the account can't be read", async () => {
    const horizon = new FakeHorizonClient();
    horizon.failingAccounts.add(USER);
    const report = await analyzeTx(buildTx([setOptions({ masterWeight: 0 })]), { horizon });
    expect(unavailable(report, "ACCT_MASTER_WEIGHT")).toEqual([
      { ruleId: "ACCT_MASTER_WEIGHT", reason: "unreachable" },
    ]);
    expect(evaluate(report, { origin: "stellix" })).toMatchObject({ state: "blocked" });
  });

  it("never reads the account when no setOptions touches the master key", async () => {
    const horizon = new FakeHorizonClient();
    horizon.failingAccounts.add(USER);
    const report = await analyzeTx(buildTx([pay(), addSigner()]), { horizon });
    expect(unavailable(report, "ACCT_MASTER_WEIGHT")).toEqual([]);
    expect(of(report, "ACCT_MASTER_WEIGHT")).toEqual([]);
  });
});
