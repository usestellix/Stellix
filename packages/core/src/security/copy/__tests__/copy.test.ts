import { describe, expect, it } from "vitest";
import { RULES } from "../../rules/index.js";
import { RULE_IDS, type Finding, type RuleId } from "../../types.js";
import { RULE_COPY, fillTemplate, findingCopy, placeholders } from "../index.js";

/**
 * Rule IDs whose rule issues (#26–#33) haven't landed yet. Each of those issues adds its copy
 * and removes its ID here; delete the list once it's empty. A registered rule is never pending.
 */
const PENDING: readonly RuleId[] = [
  "ACCT_MERGE",
  "FOREIGN_SOURCE_OP",
  "UNNAMED_OUTFLOW",
  "CLAIMABLE_TO_OTHER",
  "SPONSORSHIP_CHANGE",
  "NO_MAX_TIME",
  "HIGH_FEE",
];

/** Evidence that fills every placeholder of a rule's copy. */
const SAMPLE_EVIDENCE: Partial<Record<RuleId, Record<string, string>>> = {
  ACCT_SIGNER_CHANGE: {
    opNumber: "2",
    account: "GB2UTPVMBMQSS64UB74V3AQVQAQWNQ225NIWCIKJ3B4XNSJB5NQJFJLJ",
    signerKey: "GBUBOPHZEGSYI3ORSOOK2UZMIVES7YZXZOFBFRX2ZGBL44DYFOE4RE3S",
    weight: "1",
  },
  ACCT_MASTER_WEIGHT: {
    opNumber: "1",
    account: "GB2UTPVMBMQSS64UB74V3AQVQAQWNQ225NIWCIKJ3B4XNSJB5NQJFJLJ",
    masterWeightBefore: "1",
    masterWeightAfter: "0",
    highestThresholdAfter: "0",
  },
  MEMO_REQUIRED: { destination: "GDX3XHNB6XNJBRMOWOP4ZQVKL5CFMXD4MJFXFICFVGR7J2KQXMDIANZD" },
  OFFER_BAD_PRICE: {
    opNumber: "1",
    selling: "XLM",
    buying: "MKT",
    offerPrice: "1.8",
    bestBidPrice: "2",
    worsePercent: "10",
    lossAmount: "2",
    lossAsset: "MKT",
  },
  PATH_LOW_MIN: {
    opNumber: "1",
    sendAsset: "XLM",
    destAsset: "MKT",
    limitKind: "minimum to receive",
    limitAmount: "0.0000001",
    limitAsset: "MKT",
    bestAmount: "20",
    lossAmount: "19.9999999",
    lossPercent: "99.99",
  },
  TRUST_UNVERIFIED: {
    opNumber: "1",
    assetCode: "SRT",
    issuer: "GCXWSVROJKVC7R5QODVRA3C4MLN4USLBQKK5H4GLJQ7KS7KTBREZQ7NN",
    verification: "The issuer account has no home domain, so no website vouches for this asset.",
  },
  TRUST_CLAWBACK: {
    opNumber: "1",
    assetCode: "SRT",
    issuer: "GCXWSVROJKVC7R5QODVRA3C4MLN4USLBQKK5H4GLJQ7KS7KTBREZQ7NN",
  },
  UNSUPPORTED_OP: { opNumber: "2", opType: "invokeHostFunction" },
};

function finding(ruleId: RuleId, evidence: Record<string, string>): Finding {
  return { ruleId, severity: "high", confidence: "high", evidence };
}

const entries = Object.entries(RULE_COPY) as [RuleId, { title: string; body: string }][];

describe("copy table", () => {
  it.each(RULE_IDS)("%s has copy, or its rule hasn't landed yet", (id) => {
    expect(RULE_COPY[id] !== undefined || PENDING.includes(id)).toBe(true);
  });

  it("lists no rule as pending that already has copy", () => {
    expect(PENDING.filter((id) => RULE_COPY[id] !== undefined)).toEqual([]);
  });

  it("has copy for every registered rule", () => {
    expect(RULES.map((r) => r.id).filter((id) => RULE_COPY[id] === undefined)).toEqual([]);
  });

  it("never says safe", () => {
    for (const [id, copy] of entries) {
      expect(`${copy.title} ${copy.body}`, id).not.toMatch(/\bsafe/i);
    }
  });

  it.each(entries)("%s fills every placeholder from its evidence", (id, copy) => {
    const evidence = SAMPLE_EVIDENCE[id];
    expect(evidence, `add SAMPLE_EVIDENCE for ${id}`).toBeDefined();
    const filled = findingCopy(finding(id, evidence ?? {}));
    expect(`${filled.title} ${filled.body}`).not.toMatch(/[{}]/);
    expect(Object.keys(evidence ?? {}).sort()).toEqual(
      placeholders(`${copy.title} ${copy.body}`).sort(),
    );
  });
});

describe("fillTemplate", () => {
  it("replaces each placeholder with its evidence", () => {
    expect(fillTemplate("Pay {amount} to {to}, {amount}.", { amount: "1 XLM", to: "G…" })).toBe(
      "Pay 1 XLM to G…, 1 XLM.",
    );
  });

  it("throws on a missing placeholder instead of leaving a blank", () => {
    expect(() => fillTemplate("Pay {amount}", {})).toThrow(
      expect.objectContaining({ code: "INTERNAL_ERROR" }) as Error,
    );
  });

  it("never expands placeholders inside evidence values", () => {
    expect(fillTemplate("Memo: {memo}", { memo: "{secret}" })).toBe("Memo: {secret}");
  });

  it("lists placeholders once each, in order", () => {
    expect(placeholders("{b} {a} {b}")).toEqual(["b", "a"]);
  });
});

describe("findingCopy", () => {
  it("fills the rule's copy from the finding", () => {
    expect(
      findingCopy(finding("UNSUPPORTED_OP", { opNumber: "1", opType: "invokeHostFunction" })).body,
    ).toContain("Stellix can't decode operation 1 (invokeHostFunction) yet");
  });

  it("throws for a finding whose evidence lacks a placeholder", () => {
    expect(() => findingCopy(finding("MEMO_REQUIRED", {}))).toThrow(/\{destination\}/);
  });

  it("throws for a rule without copy", () => {
    expect(() => findingCopy(finding("HIGH_FEE", {}))).toThrow(/HIGH_FEE/);
  });
});
