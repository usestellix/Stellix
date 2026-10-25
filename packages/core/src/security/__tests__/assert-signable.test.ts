import { base64 } from "@scure/base";
import { TransactionBuilder } from "@stellar/stellar-sdk/base";
import { describe, expect, it } from "vitest";
import feeBumpFixture from "../__fixtures__/ops/feeBump.json" with { type: "json" };
import manageDataFixture from "../__fixtures__/ops/manageData-set.json" with { type: "json" };
import paymentFixture from "../__fixtures__/ops/payment-native.json" with { type: "json" };
import { FakeHorizonClient } from "../../testing/fake-horizon.js";
import { assertSignable, type Confirmation } from "../assert-signable.js";
import { analyze } from "../index.js";
import { TYPED_CONFIRMATION_PHRASE } from "../policy/policy.js";
import type {
  AnalysisReport,
  CheckUnavailable,
  Finding,
  Origin,
  RuleId,
  Severity,
  ShieldDeps,
  ShieldRequest,
} from "../types.js";

const TESTNET = paymentFixture.networkPassphrase;
const NOW = 1_000_000;
const STELLIX: Origin = { type: "stellix" };
const DAPP: Origin = { type: "dapp", url: "https://dapp.example" };

/** Mode A signs unsigned prepared transactions; strip the fixture's signatures to match. */
function unsigned(envelopeXdr: string): string {
  const tx = TransactionBuilder.fromXdr(envelopeXdr, TESTNET);
  tx.signatures.splice(0);
  return tx.toXdr();
}

const PAYMENT = unsigned(paymentFixture.envelopeXdr);
const FEE_BUMP = unsigned(feeBumpFixture.envelopeXdr);

const deps: ShieldDeps = {
  horizon: new FakeHorizonClient(),
  toml: { fetchToml: () => Promise.reject(new Error("unused")) },
  userAccount: "GUSER",
  now: () => NOW,
};

function request(xdr = PAYMENT, origin: Origin = STELLIX): ShieldRequest {
  return { kind: "transaction", xdr, network: "testnet", origin };
}

async function reportFor(req: ShieldRequest = request()): Promise<AnalysisReport> {
  return analyze(req, deps);
}

function withFindings(
  report: AnalysisReport,
  findings: [RuleId, Severity][],
  checksUnavailable: CheckUnavailable[] = [],
): AnalysisReport {
  return {
    ...report,
    findings: findings.map(([ruleId, severity]): Finding => ({
      ruleId,
      severity,
      confidence: "high",
      evidence: {},
    })),
    checksUnavailable,
  };
}

/** The error code assertSignable throws, or undefined when it passes. */
function rejection(...args: Parameters<typeof assertSignable>): string | undefined {
  try {
    assertSignable(...args);
    return undefined;
  } catch (e) {
    return (e as { code?: string }).code;
  }
}

const TYPED: Confirmation = { kind: "typed", phrase: TYPED_CONFIRMATION_PHRASE };
const CLICK: Confirmation = { kind: "click" };

describe("assertSignable: passes", () => {
  it("a ready report for the same request, before expiry", async () => {
    const report = await reportFor();
    expect(() => {
      assertSignable(request(), report, null, NOW);
    }).not.toThrow();
  });

  it("a fee bump, bound to the fee-bump hash", async () => {
    const req = request(FEE_BUMP);
    const report = await reportFor(req);
    expect(report.decoded.envelopeType).toBe("txFeeBump");
    expect(() => {
      assertSignable(req, report, null, NOW);
    }).not.toThrow();
  });
});

describe("assertSignable: one test per failure branch", () => {
  it("rejects a non-transaction request kind", async () => {
    const report = await reportFor();
    const req: ShieldRequest = {
      kind: "authEntry",
      xdr: PAYMENT,
      network: "testnet",
      origin: STELLIX,
    };
    expect(rejection(req, report, TYPED, NOW)).toBe("SHIELD_INPUT_INVALID");
  });

  it("never signs a pasted request, even with a ready report", async () => {
    const req = request(PAYMENT, { type: "pasted" });
    const report = await reportFor(req);
    expect(rejection(req, report, TYPED, NOW)).toBe("SHIELD_BLOCKED");
  });

  it("rejects a report built for another network", async () => {
    const report = await reportFor({ ...request(), network: "mainnet" });
    expect(rejection(request(), report, null, NOW)).toBe("NETWORK_MISMATCH");
  });

  it("rejects a report built for another origin", async () => {
    const report = await reportFor(request(PAYMENT, DAPP));
    expect(rejection(request(), report, null, NOW)).toBe("SHIELD_DIGEST_MISMATCH");
    const other = request(PAYMENT, { type: "dapp", url: "https://other.example" });
    expect(rejection(other, report, null, NOW)).toBe("SHIELD_DIGEST_MISMATCH");
  });

  it("rejects a report for a different transaction", async () => {
    const report = await reportFor();
    const req = request(unsigned(manageDataFixture.envelopeXdr));
    expect(rejection(req, report, null, NOW)).toBe("SHIELD_DIGEST_MISMATCH");
  });

  it("rejects an undecodable request", async () => {
    const report = await reportFor();
    expect(rejection(request("AAAA"), report, null, NOW)).toBe("SHIELD_INPUT_INVALID");
  });

  it("rejects a non-canonical encoding of the same transaction (trailing bytes)", async () => {
    const report = await reportFor();
    const padded = base64.encode(new Uint8Array([...base64.decode(PAYMENT), 0, 0, 0, 0]));
    expect(rejection(request(padded), report, null, NOW)).toBe("SHIELD_INPUT_INVALID");
  });

  it("rejects a report from another rule-set version", async () => {
    const report = { ...(await reportFor()), ruleSetVersion: "0" };
    expect(rejection(request(), report, null, NOW)).toBe("SHIELD_REPORT_EXPIRED");
  });

  it("rejects an expired report (at expiresAt, after it, and a NaN clock)", async () => {
    const report = await reportFor();
    for (const now of [report.expiresAt, report.expiresAt + 1, Number.NaN]) {
      expect(rejection(request(), report, TYPED, now)).toBe("SHIELD_REPORT_EXPIRED");
    }
  });

  it("rejects a blocked decision whatever confirmation is supplied", async () => {
    const report = withFindings(await reportFor(), [["ACCT_SIGNER_CHANGE", "critical"]]);
    for (const c of [null, CLICK, TYPED]) {
      expect(rejection(request(), report, c, NOW)).toBe("SHIELD_BLOCKED");
    }
  });

  it("re-evaluates policy itself: a blocking rule that couldn't run still blocks", async () => {
    const report = withFindings(
      await reportFor(),
      [],
      [{ ruleId: "MEMO_REQUIRED", reason: "timeout" }],
    );
    expect(rejection(request(), report, TYPED, NOW)).toBe("SHIELD_BLOCKED");
  });

  it("click review: needs some confirmation", async () => {
    const report = withFindings(await reportFor(), [["HIGH_FEE", "medium"]]);
    expect(rejection(request(), report, null, NOW)).toBe("SHIELD_CONFIRMATION_REQUIRED");
    expect(rejection(request(), report, CLICK, NOW)).toBeUndefined();
    expect(rejection(request(), report, TYPED, NOW)).toBeUndefined();
  });

  it("an unavailable check needs at least a click", async () => {
    const report = withFindings(
      await reportFor(),
      [],
      [{ ruleId: "TRUST_UNVERIFIED", reason: "timeout" }],
    );
    expect(rejection(request(), report, null, NOW)).toBe("SHIELD_CONFIRMATION_REQUIRED");
    expect(rejection(request(), report, CLICK, NOW)).toBeUndefined();
  });

  it("typed review: needs the exact phrase, a click isn't enough", async () => {
    const report = withFindings(await reportFor(), [["UNSUPPORTED_OP", "high"]]);
    const bad: (Confirmation | null)[] = [
      null,
      CLICK,
      { kind: "typed", phrase: "" },
      { kind: "typed", phrase: TYPED_CONFIRMATION_PHRASE.toLowerCase() },
      { kind: "typed", phrase: ` ${TYPED_CONFIRMATION_PHRASE}` },
    ];
    for (const c of bad) {
      expect(rejection(request(), report, c, NOW)).toBe("SHIELD_CONFIRMATION_REQUIRED");
    }
    expect(rejection(request(), report, TYPED, NOW)).toBeUndefined();
  });
});

describe("assertSignable: mutating any byte after analysis (S1 exit criterion)", () => {
  it.each([
    ["payment", PAYMENT],
    ["fee bump", FEE_BUMP],
  ])("rejects every single-byte mutation of the %s envelope", async (_, xdr) => {
    const req = request(xdr);
    const report = await reportFor(req);
    const bytes = base64.decode(xdr);
    let checked = 0;
    for (let i = 0; i < bytes.length; i++) {
      for (const mask of [0x01, 0x80, 0xff]) {
        const mutated = bytes.slice();
        mutated[i] = (mutated[i] ?? 0) ^ mask;
        const c = rejection(request(base64.encode(mutated)), report, TYPED, NOW);
        expect(["SHIELD_DIGEST_MISMATCH", "SHIELD_INPUT_INVALID"], `byte ${String(i)}`).toContain(
          c,
        );
        checked++;
      }
    }
    expect(checked).toBe(bytes.length * 3);
  });

  it("signatures aren't part of the digest: re-signing the same transaction still matches", async () => {
    // What is signed (the transaction hash) is unchanged, so the report still applies.
    const report = await reportFor();
    expect(() => {
      assertSignable(request(paymentFixture.envelopeXdr), report, null, NOW);
    }).not.toThrow();
  });
});
