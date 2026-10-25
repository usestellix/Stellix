import { NO_PRECONDITIONS } from "../decode/preconditions.js";
import { describe, expect, it } from "vitest";
import { RULES, RULE_SET_VERSION, runRules } from "../rules/index.js";
import { THRESHOLDS } from "../rules/thresholds.js";
import { RULE_IDS, type Finding, type Rule, type RuleContext, type RuleId } from "../types.js";

const ctx: RuleContext = {
  request: { kind: "transaction", xdr: "", network: "testnet", origin: { type: "pasted" } },
  decoded: {
    kind: "transaction",
    envelopeType: "tx",
    source: "GUSER",
    feeStroops: 100n,
    sequence: 1n,
    memo: { type: "none" },
    operations: [],
    maxTime: null,
    preconditions: NO_PRECONDITIONS,
    feeBump: null,
  },
  network: "testnet",
  origin: { type: "pasted" },
  userAccount: "GUSER",
  now: 1_000,
  data: {},
};

function finding(ruleId: RuleId, opIndex?: number): Finding {
  return {
    ruleId,
    severity: "medium",
    confidence: "high",
    evidence: {},
    ...(opIndex === undefined ? {} : { opIndex }),
  };
}

function rule(id: RuleId, evaluate: Rule["evaluate"]): Rule {
  return { id, evaluate };
}

describe("runRules", () => {
  it("runs rules in registry order and keeps each rule's findings in order", () => {
    const calls: RuleId[] = [];
    const rules = [
      rule("HIGH_FEE", () => {
        calls.push("HIGH_FEE");
        return [finding("HIGH_FEE", 1), finding("HIGH_FEE", 0)];
      }),
      rule("ACCT_MERGE", () => {
        calls.push("ACCT_MERGE");
        return [];
      }),
      rule("NO_MAX_TIME", () => {
        calls.push("NO_MAX_TIME");
        return [finding("NO_MAX_TIME")];
      }),
    ];
    const run = runRules(rules, ctx);
    expect(calls).toEqual(["HIGH_FEE", "ACCT_MERGE", "NO_MAX_TIME"]);
    expect(run.findings.map((f) => [f.ruleId, f.opIndex])).toEqual([
      ["HIGH_FEE", 1],
      ["HIGH_FEE", 0],
      ["NO_MAX_TIME", undefined],
    ]);
    expect(run.checksUnavailable).toEqual([]);
  });

  it("puts a RuleUnavailable result in checksUnavailable with its reason, and keeps going", () => {
    const run = runRules(
      [
        rule("TRUST_UNVERIFIED", () => ({ unavailable: true, reason: "timeout" })),
        rule("TRUST_CLAWBACK", () => [finding("TRUST_CLAWBACK")]),
      ],
      ctx,
    );
    expect(run.checksUnavailable).toEqual([{ ruleId: "TRUST_UNVERIFIED", reason: "timeout" }]);
    expect(run.findings.map((f) => f.ruleId)).toEqual(["TRUST_CLAWBACK"]);
  });

  it("treats a rule that throws as unavailable (internal), never as a pass", () => {
    const run = runRules(
      [
        rule("OFFER_BAD_PRICE", () => {
          throw new Error("bug");
        }),
        rule("PATH_LOW_MIN", () => [finding("PATH_LOW_MIN")]),
      ],
      ctx,
    );
    expect(run.checksUnavailable).toEqual([{ ruleId: "OFFER_BAD_PRICE", reason: "internal" }]);
    expect(run.findings.map((f) => f.ruleId)).toEqual(["PATH_LOW_MIN"]);
  });

  it("rejects findings emitted under another rule's ID", () => {
    const run = runRules([rule("HIGH_FEE", () => [finding("ACCT_SIGNER_CHANGE")])], ctx);
    expect(run.findings).toEqual([]);
    expect(run.checksUnavailable).toEqual([{ ruleId: "HIGH_FEE", reason: "internal" }]);
  });

  it("gives rules the same context object, including the fixed clock", () => {
    const seen: number[] = [];
    runRules(
      [
        rule("NO_MAX_TIME", (c) => (seen.push(c.now), [])),
        rule("HIGH_FEE", (c) => (seen.push(c.now), [])),
      ],
      ctx,
    );
    expect(seen).toEqual([1_000, 1_000]);
  });
});

describe("registry", () => {
  it("has unique, known rule IDs", () => {
    const ids = RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(RULE_IDS).toContain(id);
  });

  it("has a rule-set version", () => {
    expect(RULE_SET_VERSION).toMatch(/^\S+$/);
  });

  it("has unique rule IDs", () => {
    expect(new Set(RULE_IDS).size).toBe(RULE_IDS.length);
  });
});

describe("THRESHOLDS", () => {
  it("holds the approved values, money as bigint stroops", () => {
    expect(THRESHOLDS.OFFER_BAD_PRICE.maxWorseThanBestBps).toBe(500);
    expect(THRESHOLDS.PATH_LOW_MIN.maxLossVsBestPathBps).toBe(500);
    expect(THRESHOLDS.NO_MAX_TIME.maxValiditySeconds).toBe(3_600n);
    expect(THRESHOLDS.HIGH_FEE.maxTotalFeeStroops).toBe(1_000_000n);
  });
});
