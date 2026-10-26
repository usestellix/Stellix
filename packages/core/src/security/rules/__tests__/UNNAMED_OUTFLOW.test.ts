import { Asset, Claimant, Networks, Operation } from "@stellar/stellar-sdk/base";
import { describe, expect, it } from "vitest";
import { buildPaymentTransaction } from "../../../tx/build.js";
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
import { decodeTransactionEnvelope } from "../../decode/envelope.js";
import { evaluate } from "../../policy/policy.js";
import type { AnalysisReport } from "../../types.js";
import { listOutflows } from "../UNNAMED_OUTFLOW.js";

const MUXED_PEER = "MDX3XHNB6XNJBRMOWOP4ZQVKL5CFMXD4MJFXFICFVGR7J2KQXMDIAAAAAAAAABTZGJRSO";
const STELLIX = { type: "stellix" } as const;

const outflowFindings = (report: AnalysisReport) =>
  report.findings.filter((f) => f.ruleId === "UNNAMED_OUTFLOW");

/** What the Send flow builds and signs: one payment or createAccount to the form's destination. */
function sendBuilt(destination: string, kind: "payment" | "createAccount" = "payment") {
  return buildPaymentTransaction({
    sourceId: USER,
    sourceSequence: "1",
    kind,
    destination,
    amountStroops: 25_000_000n,
    memo: { type: "none" },
    feeStroops: 100n,
    networkPassphrase: Networks.TESTNET,
  })
    .toEnvelope()
    .toXdr("base64");
}

describe("UNNAMED_OUTFLOW", () => {
  it("doesn't fire for the single Send-built payment to the presented destination", async () => {
    for (const [destination, kind] of [
      [PEER, "payment"],
      [MUXED_PEER, "payment"],
      [OTHER, "createAccount"],
    ] as const) {
      const report = await analyzeTx(sendBuilt(destination, kind), {
        origin: STELLIX,
        presented: [destination],
      });
      expect(outflowFindings(report), destination).toEqual([]);
    }
  });

  it("fires for a payment to a second address the Send form never showed", async () => {
    const report = await analyzeTx(buildTx([pay(PEER), pay(OTHER)]), {
      origin: STELLIX,
      presented: [PEER],
    });
    const findings = outflowFindings(report);
    expect(findings).toEqual([
      {
        ruleId: "UNNAMED_OUTFLOW",
        severity: "high",
        confidence: "high",
        opIndex: 1,
        evidence: { opNumber: "2", opType: "payment", destination: OTHER, amount: "1 XLM" },
      },
    ]);
    expect(findingCopy(findings[0]!).body).toContain(`sends 1 XLM to ${OTHER}`);
    expect(evaluate(report, { origin: "stellix" })).toMatchObject({ requires: "typed" });
  });

  it("matches presented addresses exactly: a muxed address doesn't present its base account", async () => {
    const report = await analyzeTx(buildTx([pay(PEER)]), { presented: [MUXED_PEER] });
    expect(outflowFindings(report)).toMatchObject([{ evidence: { destination: PEER } }]);
  });

  it("lists every outflow as a finding in Mode C, where nothing is presented", async () => {
    const report = await analyzeTx(fixture("payment-credit").envelopeXdr, { userAccount: PEER });
    // payment-credit: the issuer side pays the user CLAW; from the payer's side it's an outflow.
    const decoded = decodeTransactionEnvelope(fixture("payment-credit").envelopeXdr, "testnet");
    const payer = decoded.decoded.source;
    const fromPayer = await analyzeTx(fixture("payment-credit").envelopeXdr, {
      userAccount: payer,
    });
    expect(outflowFindings(report)).toEqual([]);
    expect(outflowFindings(fromPayer)).toMatchObject([
      {
        evidence: { destination: USER, amount: expect.stringMatching(/^1000 CLAW \(G/) as string },
      },
    ]);
  });

  it("describes merges, strict-receive limits and claimable balances", async () => {
    const report = await analyzeTx(
      buildTx([
        Operation.pathPaymentStrictReceive({
          sendAsset: Asset.native(),
          sendMax: "5",
          destination: PEER,
          destAsset: Asset.native(),
          destAmount: "1",
          path: [],
        }),
        Operation.createClaimableBalance({
          asset: Asset.native(),
          amount: "2",
          claimants: [new Claimant(USER), new Claimant(OTHER)],
        }),
        Operation.accountMerge({ destination: PEER }),
      ]),
    );
    expect(
      outflowFindings(report).map((f) => [f.opIndex, f.evidence.destination, f.evidence.amount]),
    ).toEqual([
      [0, PEER, "up to 5 XLM"],
      // The user's own claimant isn't an outflow; the other one is.
      [1, OTHER, "2 XLM"],
      [2, PEER, "the account's whole XLM balance"],
    ]);
  });

  it("ignores payments to the user's own account, muxed or not", async () => {
    const report = await analyzeTx(buildTx([pay(USER), pay(USER_MUXED)]));
    expect(outflowFindings(report)).toEqual([]);
  });

  it("ignores ops another account is the source of", async () => {
    const report = await analyzeTx(buildTx([pay(OTHER, PEER)]));
    expect(outflowFindings(report)).toEqual([]);
  });

  it("lists offers and pool deposits as market outflows without flagging them", async () => {
    for (const name of ["manageSellOffer-create", "liquidityPoolDeposit"]) {
      const f = fixture(name);
      const source = decodeTransactionEnvelope(f.envelopeXdr, "testnet").decoded.source;
      const report = await analyzeTx(f.envelopeXdr, { userAccount: source });
      expect(outflowFindings(report), name).toEqual([]);
      expect(
        listOutflows(decodeTransactionEnvelope(f.envelopeXdr, "testnet").decoded, source),
      ).toMatchObject([{ kind: "market", opIndex: 0 }]);
    }
  });
});
