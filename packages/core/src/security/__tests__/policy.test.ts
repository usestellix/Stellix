import { describe, expect, it } from "vitest";
import {
  RULE_POLICY,
  SEVERITY_FLOOR,
  TYPED_CONFIRMATION_PHRASE,
  evaluate,
  ruleOutcome,
  type Policy,
  type PolicyOutcome,
} from "../policy/policy.js";
import { compareSeverity, maxSeverity } from "../policy/severity.js";
import {
  RULE_IDS,
  SEVERITIES,
  type AnalysisReport,
  type CheckUnavailable,
  type Finding,
  type Origin,
  type PolicyDecision,
  type RuleId,
  type Severity,
} from "../types.js";

// Severities from the SHIELD §6.1 catalogue: what each rule emits.
const CATALOGUE_SEVERITY: Record<RuleId, Severity> = {
  ACCT_SIGNER_CHANGE: "critical",
  ACCT_MASTER_WEIGHT: "critical",
  ACCT_MERGE: "critical",
  FOREIGN_SOURCE_OP: "high",
  UNNAMED_OUTFLOW: "high",
  OFFER_BAD_PRICE: "high",
  PATH_LOW_MIN: "high",
  CLAIMABLE_TO_OTHER: "medium",
  TRUST_UNVERIFIED: "medium",
  TRUST_CLAWBACK: "medium",
  SPONSORSHIP_CHANGE: "medium",
  NO_MAX_TIME: "medium",
  HIGH_FEE: "medium",
  MEMO_REQUIRED: "high",
  UNSUPPORTED_OP: "high",
};

const MODES: readonly Origin["type"][] = ["stellix", "dapp", "pasted"];

// SHIELD §6.1 Policy column, written out independently of RULE_POLICY: [rule, Mode A, Mode B].
// Mode C is evaluated as Mode B. The exhaustive sweeps below use this, not the code's table.
const table: [RuleId, PolicyOutcome, PolicyOutcome][] = [
  ["ACCT_SIGNER_CHANGE", "block", "block"],
  ["ACCT_MASTER_WEIGHT", "block", "block"],
  ["ACCT_MERGE", "typed", "block"],
  ["FOREIGN_SOURCE_OP", "typed", "typed"],
  ["UNNAMED_OUTFLOW", "typed", "typed"],
  ["OFFER_BAD_PRICE", "click", "click"],
  ["PATH_LOW_MIN", "click", "click"],
  ["CLAIMABLE_TO_OTHER", "click", "click"],
  ["TRUST_UNVERIFIED", "click", "click"],
  ["TRUST_CLAWBACK", "click", "click"],
  ["SPONSORSHIP_CHANGE", "click", "click"],
  ["NO_MAX_TIME", "click", "click"],
  ["HIGH_FEE", "click", "click"],
  ["MEMO_REQUIRED", "block", "block"],
  ["UNSUPPORTED_OP", "typed", "typed"],
];

function specOutcome(id: RuleId, mode: Origin["type"]): PolicyOutcome {
  const row = table.find(([r]) => r === id);
  if (row === undefined) throw new Error(`no spec row for ${id}`);
  return mode === "stellix" ? row[1] : row[2];
}

function report(findings: Finding[], checksUnavailable: CheckUnavailable[] = []): AnalysisReport {
  return {
    digest: "00",
    network: "testnet",
    origin: { type: "dapp", url: "https://example.com" },
    ruleSetVersion: "1",
    decoded: { kind: "transaction", envelopeType: "tx", operations: [], maxTime: null },
    simulation: { status: "not_applicable" },
    findings,
    checksUnavailable,
    createdAt: 0,
    expiresAt: 1,
  };
}

function finding(ruleId: RuleId, severity: Severity = CATALOGUE_SEVERITY[ruleId]): Finding {
  return { ruleId, severity, confidence: "high", evidence: {} };
}

function unavailable(ruleId: RuleId): CheckUnavailable {
  return { ruleId, reason: "timeout" };
}

function subset(mask: number): RuleId[] {
  return RULE_IDS.filter((_, i) => (mask & (1 << i)) !== 0);
}

const ORDER: readonly PolicyOutcome[] = ["ready", "click", "typed", "block"];
const strictest = (os: PolicyOutcome[]) =>
  os.reduce<PolicyOutcome>((a, b) => (ORDER.indexOf(b) > ORDER.indexOf(a) ? b : a), "ready");

/** The decision the policy table implies, computed independently of evaluate. */
function expected(
  fired: readonly RuleId[],
  missing: readonly RuleId[],
  mode: Origin["type"],
): PolicyDecision {
  const outcomes = [
    ...fired.map((id) =>
      strictest([specOutcome(id, mode), SEVERITY_FLOOR[CATALOGUE_SEVERITY[id]]]),
    ),
    ...missing.map((id) => strictest([specOutcome(id, mode), "click"])),
  ];
  const all = [...fired, ...missing];
  switch (strictest(outcomes)) {
    case "ready":
      return { state: "ready" };
    case "click":
      return { state: "review", requires: "click" };
    case "typed":
      return { state: "review", requires: "typed", typedPhrase: TYPED_CONFIRMATION_PHRASE };
    case "block":
      return {
        state: "blocked",
        ruleIds: all.filter((id, i) => outcomes[i] === "block"),
        overridable: false,
      };
  }
}

const isBlocking = (id: RuleId, mode: Origin["type"]) => specOutcome(id, mode) === "block";

describe("severity", () => {
  it("orders info < low < medium < high < critical", () => {
    for (let i = 1; i < SEVERITIES.length; i++) {
      const lower = SEVERITIES[i - 1] as Severity;
      const higher = SEVERITIES[i] as Severity;
      expect(compareSeverity(lower, higher)).toBeLessThan(0);
      expect(compareSeverity(higher, lower)).toBeGreaterThan(0);
      expect(compareSeverity(higher, higher)).toBe(0);
    }
  });

  it("takes the maximum, never an average", () => {
    expect(maxSeverity([])).toBeNull();
    const many: Severity[] = [...Array<Severity>(1000).fill("info"), "critical", "low"];
    expect(maxSeverity(many)).toBe("critical");
  });
});

describe("evaluate: the mode matrix (SHIELD §6.1, §6.5)", () => {
  it("covers every rule exactly once", () => {
    expect(table.map(([id]) => id).sort()).toEqual([...RULE_IDS].sort());
    expect(Object.keys(RULE_POLICY).sort()).toEqual([...RULE_IDS].sort());
  });

  const toDecision = (o: PolicyOutcome, id: RuleId): PolicyDecision =>
    o === "block"
      ? { state: "blocked", ruleIds: [id], overridable: false }
      : o === "typed"
        ? { state: "review", requires: "typed", typedPhrase: TYPED_CONFIRMATION_PHRASE }
        : o === "click"
          ? { state: "review", requires: "click" }
          : { state: "ready" };

  it.each(table)("%s: Mode A %s, Mode B %s, Mode C as Mode B", (id, modeA, modeB) => {
    const r = report([finding(id)]);
    expect(evaluate(r, { origin: "stellix" })).toEqual(toDecision(modeA, id));
    expect(evaluate(r, { origin: "dapp" })).toEqual(toDecision(modeB, id));
    expect(evaluate(r, { origin: "pasted" })).toEqual(toDecision(modeB, id));
  });

  it.each(RULE_IDS)("ruleOutcome(%s) matches the spec in every mode", (id) => {
    for (const mode of MODES) expect(ruleOutcome(id, mode)).toBe(specOutcome(id, mode));
  });

  it("is ready only with no findings and no unavailable checks", () => {
    for (const origin of MODES)
      expect(evaluate(report([]), { origin })).toEqual({ state: "ready" });
  });
});

describe("evaluate: severity", () => {
  it("never lets any number of lower findings outweigh a critical one", () => {
    const lower = RULE_IDS.filter((id) => CATALOGUE_SEVERITY[id] !== "critical").map((id) =>
      finding(id),
    );
    const noise = Array.from({ length: 200 }, () => finding("HIGH_FEE", "info"));
    for (const origin of MODES) {
      // ACCT_MERGE is critical but not blocking in Mode A: it must still need typing.
      const d = evaluate(report([...noise, ...lower, finding("ACCT_MERGE")]), { origin });
      expect(d.state === "blocked" || (d.state === "review" && d.requires === "typed")).toBe(true);
    }
  });

  it("has the approved floors: critical → typed, medium/high → click, info/low → none", () => {
    expect(SEVERITY_FLOOR).toEqual({
      info: "ready",
      low: "ready",
      medium: "click",
      high: "click",
      critical: "typed",
    });
  });

  it.each([
    ["info", "click"],
    ["low", "click"],
    ["medium", "click"],
    ["high", "click"],
    ["critical", "typed"],
  ] as const)("a %s finding from a click rule needs %s", (severity, requires) => {
    // HIGH_FEE's own policy is click; only the critical floor raises it.
    const d = evaluate(report([finding("HIGH_FEE", severity)]), { origin: "stellix" });
    expect(d).toEqual(
      requires === "typed"
        ? { state: "review", requires, typedPhrase: TYPED_CONFIRMATION_PHRASE }
        : { state: "review", requires },
    );
  });
});

describe("evaluate: unavailable checks (invariant 18)", () => {
  it.each(RULE_IDS)("%s unavailable forces at least review, in every mode", (id) => {
    for (const origin of MODES) {
      const d = evaluate(report([], [unavailable(id)]), { origin });
      expect(d.state).not.toBe("ready");
      if (isBlocking(id, origin))
        expect(d).toEqual({ state: "blocked", ruleIds: [id], overridable: false });
    }
  });
});

describe("evaluate: exhaustive over every subset of rules × mode", () => {
  const SUBSETS = 1 << RULE_IDS.length;

  function check(fired: RuleId[], missing: RuleId[], policy: Policy) {
    const d = evaluate(
      report(
        fired.map((id) => finding(id)),
        missing.map(unavailable),
      ),
      policy,
    );
    expect(d).toEqual(expected(fired, missing, policy.origin));
    // Non-overridable: any blocking rule present, fired or unavailable → blocked, no override.
    if ([...fired, ...missing].some((id) => isBlocking(id, policy.origin))) {
      expect(d.state).toBe("blocked");
      expect(d).toMatchObject({ overridable: false });
    } else if (fired.length + missing.length > 0) {
      expect(d.state).toBe("review");
    }
  }

  it.each(MODES)("fired findings only (%s)", (origin) => {
    for (let m = 0; m < SUBSETS; m++) check(subset(m), [], { origin });
  });

  it.each(MODES)("unavailable checks only (%s)", (origin) => {
    for (let m = 0; m < SUBSETS; m++) check([], subset(m), { origin });
  });

  it.each(MODES)("every rule either fired or unavailable (%s)", (origin) => {
    for (let m = 0; m < SUBSETS; m++) check(subset(m), subset(~m & (SUBSETS - 1)), { origin });
  });

  it("lists each blocking rule once, even when it fires repeatedly", () => {
    const d = evaluate(
      report(
        [finding("ACCT_SIGNER_CHANGE"), finding("ACCT_SIGNER_CHANGE"), finding("HIGH_FEE")],
        [unavailable("ACCT_SIGNER_CHANGE")],
      ),
      { origin: "dapp" },
    );
    expect(d).toEqual({ state: "blocked", ruleIds: ["ACCT_SIGNER_CHANGE"], overridable: false });
  });
});
