import { Keypair, Networks, TransactionBuilder } from "@stellar/stellar-sdk/base";
import { describe, expect, it } from "vitest";
import { fixture } from "../../__fixtures__/load.js";
import { NOW, PEER, USER, analyzeTx, buildTx, pay } from "../../__tests__/build-tx.js";
import { findingCopy } from "../../copy/index.js";
import type { AnalysisReport, RuleId } from "../../types.js";

const of = (report: AnalysisReport, id: RuleId) => report.findings.filter((f) => f.ruleId === id);

describe("NO_MAX_TIME", () => {
  it.each(["preconditions-no-max-time", "preconditions-none"])(
    "fires on %s, which has no upper time bound",
    async (name) => {
      const report = await analyzeTx(fixture(name).envelopeXdr);
      const findings = of(report, "NO_MAX_TIME");
      expect(findings).toEqual([
        {
          ruleId: "NO_MAX_TIME",
          severity: "medium",
          confidence: "high",
          evidence: { validUntil: "no end time", maxValidity: "1 hour" },
        },
      ]);
      expect(findingCopy(findings[0]!).body).toContain("submitted until no end time");
    },
  );

  it("fires when maxTime is more than the threshold after now", async () => {
    const report = await analyzeTx(buildTx([pay()], { validForSeconds: 3_601 }));
    const until = new Date(NOW + 3_601_000).toISOString();
    expect(of(report, "NO_MAX_TIME")).toMatchObject([
      { evidence: { validUntil: `${until.slice(0, 10)} ${until.slice(11, 19)} UTC` } },
    ]);
  });

  it("doesn't fire at exactly the threshold, or for a short-lived transaction", async () => {
    for (const valid of [3_600, 180]) {
      const report = await analyzeTx(buildTx([pay()], { validForSeconds: valid }));
      expect(of(report, "NO_MAX_TIME"), String(valid)).toEqual([]);
    }
  });

  it("doesn't fire on the captured payment, which expires within the hour", async () => {
    const report = await analyzeTx(fixture("payment-native").envelopeXdr);
    expect(of(report, "NO_MAX_TIME")).toEqual([]);
  });
});

describe("HIGH_FEE", () => {
  const feePayer = Keypair.fromPublicKey(PEER);

  function feeBump(baseFeeStroops: string): string {
    const inner = TransactionBuilder.fromXdr(buildTx([pay()]), Networks.TESTNET);
    if (!("operations" in inner) || "innerTransaction" in inner) throw new Error("not a plain tx");
    return TransactionBuilder.buildFeeBumpTransaction(
      feePayer,
      baseFeeStroops,
      inner,
      Networks.TESTNET,
    )
      .toEnvelope()
      .toXdr("base64");
  }

  it("fires on a fee bump with a large max fee, with the max cost in stroops", async () => {
    // A fee bump's max fee is the base fee × (ops + 1): 1,000,000 × 2.
    const report = await analyzeTx(feeBump("1000000"));
    const findings = of(report, "HIGH_FEE");
    expect(findings).toEqual([
      {
        ruleId: "HIGH_FEE",
        severity: "medium",
        confidence: "high",
        evidence: {
          maxFee: "0.2",
          maxFeeStroops: "2000000",
          threshold: "0.1",
          feePayer: PEER,
        },
      },
    ]);
    expect(findingCopy(findings[0]!).body).toContain(`lets ${PEER} be charged up to 0.2 XLM`);
  });

  it("fires on a fee bid above the threshold, paid by the user", async () => {
    const report = await analyzeTx(buildTx([pay()], { feeStroops: "1000001" }));
    expect(of(report, "HIGH_FEE")).toMatchObject([
      { evidence: { maxFeeStroops: "1000001", feePayer: `your account ${USER}` } },
    ]);
  });

  it("doesn't fire at the threshold, or on the captured fee bump's 4000-stroop max fee", async () => {
    expect(of(await analyzeTx(buildTx([pay()], { feeStroops: "1000000" })), "HIGH_FEE")).toEqual(
      [],
    );
    expect(of(await analyzeTx(fixture("feeBump").envelopeXdr), "HIGH_FEE")).toEqual([]);
  });
});
