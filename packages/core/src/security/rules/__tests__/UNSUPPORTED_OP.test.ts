import { describe, expect, it } from "vitest";
import { FakeHorizonClient } from "../../../testing/fake-horizon.js";
import { FIXTURES } from "../../__fixtures__/load.js";
import { UNSUPPORTED_OPS, envelopeWith, payment } from "../../__tests__/soroban-envelopes.js";
import { findingCopy } from "../../copy/index.js";
import { analyze } from "../../index.js";
import { evaluate } from "../../policy/policy.js";
import type { RuleContext, ShieldDeps } from "../../types.js";
import { UNSUPPORTED_OP } from "../UNSUPPORTED_OP.js";

const NOW = Date.parse("2026-10-25T11:00:00Z");

const deps: ShieldDeps = {
  horizon: new FakeHorizonClient(),
  toml: { fetchToml: () => Promise.reject(new Error("no toml in this test")) },
  userAccount: "GUSER",
  now: () => NOW,
};

function analyzeXdr(xdrBase64: string) {
  return analyze(
    { kind: "transaction", xdr: xdrBase64, network: "testnet", origin: { type: "pasted" } },
    deps,
  );
}

function build(opType: string) {
  const make = UNSUPPORTED_OPS[opType];
  if (make === undefined) throw new Error(`no builder for ${opType}`);
  return make();
}

describe("UNSUPPORTED_OP", () => {
  it.each(Object.keys(UNSUPPORTED_OPS))("reports %s with one high finding", async (opType) => {
    const report = await analyzeXdr(envelopeWith(build(opType)));
    expect(report.findings).toEqual([
      {
        ruleId: "UNSUPPORTED_OP",
        severity: "high",
        confidence: "high",
        opIndex: 0,
        evidence: { opNumber: "1", opType },
      },
    ]);
    // Never shown silently: it needs a typed confirmation, and its copy names the op.
    expect(evaluate(report, { origin: "dapp" })).toMatchObject({ requires: "typed" });
    expect(findingCopy(report.findings[0]!).body).toContain(`operation 1 (${opType})`);
  });

  it("reports one finding per unsupported op, at its own index", async () => {
    const report = await analyzeXdr(
      envelopeWith(payment(), build("invokeHostFunction"), payment(), build("inflation")),
    );
    expect(report.findings.map((f) => [f.opIndex, f.evidence])).toEqual([
      [1, { opNumber: "2", opType: "invokeHostFunction" }],
      [3, { opNumber: "4", opType: "inflation" }],
    ]);
  });

  it("reports an op type the decoder doesn't know", () => {
    const ctx = {
      decoded: {
        operations: [
          { kind: "unsupported", opType: "someFutureOp", reason: "unknown", source: null },
        ],
      },
    } as unknown as RuleContext;
    expect(UNSUPPORTED_OP.evaluate(ctx)).toMatchObject([
      { ruleId: "UNSUPPORTED_OP", opIndex: 0, evidence: { opType: "someFutureOp" } },
    ]);
  });

  it("finds nothing in any captured classic fixture", async () => {
    for (const f of FIXTURES) {
      const report = await analyzeXdr(f.envelopeXdr);
      expect(report.findings, f.name).toEqual([]);
    }
  });
});
