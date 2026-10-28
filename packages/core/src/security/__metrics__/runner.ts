import { accountSchema, orderBookSchema, pathsPageSchema } from "../../network/horizon-schemas.js";
import { FakeHorizonClient } from "../../testing/fake-horizon.js";
import { MemoryKeyValueStore } from "../../testing/memory-key-value-store.js";
import {
  CLASSIC_CORPUS,
  CORPUS_NOW,
  type ClassicCorpusCase,
  type ClassicCorpusExpectation,
} from "../__corpus__/classic.js";
import {
  BENIGN_FIXTURES,
  marketFixture,
  type BenignFixture,
  type MarketFixture,
  type MarketLookup,
} from "../__fixtures__/load.js";
import { decodeTransactionEnvelope } from "../decode/envelope.js";
import { analyze } from "../index.js";
import { createTomlFetcher } from "../intel/toml.js";
import { evaluate } from "../policy/policy.js";
import { checkedOffers } from "../rules/OFFER_BAD_PRICE.js";
import { checkedPathPayments } from "../rules/PATH_LOW_MIN.js";
import { checkedTrustlines } from "../rules/trust.js";
import {
  RULE_IDS,
  type Origin,
  type RuleId,
  type ShieldDeps,
  type ShieldRequest,
} from "../types.js";

export interface ShieldMetricsOutput {
  now(): number;
  write(text: string): void;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nExpected: ${expectedJson}\nReceived: ${actualJson}`);
  }
}

interface MetricCase {
  id: string;
  request: ShieldRequest;
  deps: ShieldDeps;
  expectedFindings: readonly RuleId[];
  expectedDecision?: ClassicCorpusExpectation["decision"];
}

function dependencies(options: {
  xdr: string;
  userAccount: string;
  now: number;
  market?: MarketFixture;
  lookups?: Record<string, MarketLookup>;
}): ShieldDeps {
  const horizon = new FakeHorizonClient();
  const decoded = decodeTransactionEnvelope(options.xdr, "testnet").decoded;
  const issuerLookup = options.market?.lookups.issuer ?? options.lookups?.issuer;
  if (issuerLookup !== undefined) {
    const account = accountSchema.parse(issuerLookup.body);
    horizon.accounts.set(account.id, account);
  }

  const orderBookLookup = options.market?.lookups.orderBook ?? options.lookups?.orderBook;
  if (orderBookLookup !== undefined) {
    const orderBook = orderBookSchema.parse(orderBookLookup.body);
    for (const offer of checkedOffers(decoded, options.userAccount)) {
      horizon.orderBooks.set(
        FakeHorizonClient.orderBookKey(offer.selling, offer.buying),
        orderBook,
      );
    }
  }

  const pathsLookup = options.market?.lookups.paths ?? options.lookups?.paths;
  if (pathsLookup !== undefined) {
    const records = pathsPageSchema.parse(pathsLookup.body)._embedded.records;
    for (const path of checkedPathPayments(decoded, options.userAccount)) {
      const key =
        path.mode === "strictSend"
          ? FakeHorizonClient.strictSendKey(path.sendAsset, path.fixedStroops, path.destAsset)
          : FakeHorizonClient.strictReceiveKey(path.sendAsset, path.destAsset, path.fixedStroops);
      horizon.paths.set(key, records);
    }
  }

  const tomlLookup = options.market?.lookups.toml ?? options.lookups?.toml;
  for (const { issuer } of checkedTrustlines(decoded, options.userAccount)) {
    const issuerRecord = horizon.accounts.get(issuer);
    if (issuerRecord === undefined) {
      throw new Error(`missing captured issuer account for ${issuer}`);
    }
    if (issuerRecord.home_domain !== undefined && tomlLookup === undefined) {
      throw new Error(`missing captured stellar.toml for ${issuerRecord.home_domain}`);
    }
  }

  return {
    horizon,
    toml: createTomlFetcher({
      fetch: () => {
        if (tomlLookup === undefined) {
          return Promise.reject(new Error("no captured stellar.toml for this transaction"));
        }
        return Promise.resolve(
          new Response(tomlLookup.text ?? "", {
            status: tomlLookup.status,
            headers: { "Content-Type": tomlLookup.headers?.["content-type"] ?? "text/plain" },
          }),
        );
      },
      session: new MemoryKeyValueStore(),
      now: () => options.now,
    }),
    userAccount: options.userAccount,
    now: () => options.now,
  };
}

function adversarialCase(testCase: ClassicCorpusCase, mode: "mode-a" | "mode-c"): MetricCase {
  const origin: Origin = mode === "mode-a" ? { type: "stellix" } : { type: "pasted" };
  const request: ShieldRequest = {
    kind: "transaction",
    xdr: testCase.xdr,
    network: "testnet",
    origin,
    presented: { destinations: mode === "mode-a" ? testCase.presentedInModeA : [] },
  };
  return {
    id: `${testCase.id} (${mode})`,
    request,
    deps: dependencies({
      xdr: request.xdr,
      userAccount: testCase.userAccount,
      ...(testCase.marketFixture === undefined
        ? {}
        : { market: marketFixture(testCase.marketFixture) }),
      now: CORPUS_NOW,
    }),
    expectedFindings: testCase.expected[mode === "mode-a" ? "stellix" : "pasted"].findingIds,
    expectedDecision: testCase.expected[mode === "mode-a" ? "stellix" : "pasted"].decision,
  };
}

function benignCase(fixture: BenignFixture): MetricCase {
  const request: ShieldRequest = {
    kind: "transaction",
    xdr: fixture.envelopeXdr,
    network: "testnet",
    origin: { type: "stellix" },
    presented: { destinations: fixture.presentedDestinations },
  };
  return {
    id: fixture.id,
    request,
    deps: dependencies({
      xdr: fixture.envelopeXdr,
      userAccount: fixture.userAccount,
      lookups: fixture.lookups,
      now: Date.parse(fixture.capturedAt),
    }),
    expectedFindings: fixture.expectedFindings,
  };
}

function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil((p / 100) * sorted.length) - 1] ?? 0;
}

export async function runShieldMetrics(output: ShieldMetricsOutput): Promise<void> {
  assert(BENIGN_FIXTURES.length > 0, "benign testnet corpus is empty; run its capture script");
  assert(
    new Set(BENIGN_FIXTURES.map(({ id }) => id)).size === BENIGN_FIXTURES.length,
    "benign corpus contains duplicate IDs",
  );
  for (const fixture of BENIGN_FIXTURES) {
    assert(
      fixture.networkPassphrase === "Test SDF Network ; September 2015",
      `${fixture.id} was not captured from Stellar testnet`,
    );
    assert(fixture.transaction.body.successful === true, `${fixture.id} did not succeed`);
    assert(fixture.hash === fixture.transaction.body.hash, `${fixture.id} transaction hash`);
  }

  const adversarialCases = CLASSIC_CORPUS.flatMap((testCase) => [
    adversarialCase(testCase, "mode-a"),
    adversarialCase(testCase, "mode-c"),
  ]);
  const benignCases = BENIGN_FIXTURES.map(benignCase);
  const allCases = [...adversarialCases, ...benignCases];
  const referenceSamples: number[] = [];
  const adversarialDetections = new Map<RuleId, number>(RULE_IDS.map((id) => [id, 0]));
  const benignFalsePositives = new Map<RuleId, number>(RULE_IDS.map((id) => [id, 0]));

  async function check(testCase: MetricCase, category: "adversarial" | "benign") {
    const started = output.now();
    const report = await analyze(testCase.request, testCase.deps);
    referenceSamples.push(output.now() - started);
    const actualIds = report.findings.map(({ ruleId }) => ruleId);
    assertEqual(report.checksUnavailable, [], `${category} ${testCase.id}: unavailable checks`);

    if (category === "adversarial") {
      assertEqual(actualIds, testCase.expectedFindings, `${category} ${testCase.id}: findings`);
      const decision = evaluate(report, { origin: testCase.request.origin.type });
      assertEqual(decision, testCase.expectedDecision, `${category} ${testCase.id}: decision`);
      assert(decision.state !== "ready", `${category} ${testCase.id} unexpectedly ready`);
      for (const { ruleId } of report.findings) {
        adversarialDetections.set(ruleId, (adversarialDetections.get(ruleId) ?? 0) + 1);
      }
      return;
    }

    const severe = report.findings.filter(
      ({ severity }) => severity === "high" || severity === "critical",
    );
    assertEqual(severe, [], `benign ${testCase.id}: high/critical false positive`);
    const expectedCounts = new Map<RuleId, number>();
    for (const ruleId of testCase.expectedFindings) {
      expectedCounts.set(ruleId, (expectedCounts.get(ruleId) ?? 0) + 1);
    }
    for (const { ruleId } of report.findings) {
      const remainingExpected = expectedCounts.get(ruleId) ?? 0;
      if (remainingExpected > 0) {
        expectedCounts.set(ruleId, remainingExpected - 1);
      } else {
        benignFalsePositives.set(ruleId, (benignFalsePositives.get(ruleId) ?? 0) + 1);
      }
    }
  }

  for (const testCase of adversarialCases) await check(testCase, "adversarial");
  for (const testCase of benignCases) await check(testCase, "benign");

  for (let round = 0; round < 8; round++) {
    for (const testCase of allCases) {
      const started = output.now();
      await analyze(testCase.request, testCase.deps);
      referenceSamples.push(output.now() - started);
    }
  }

  const falsePositiveTotal = [...benignFalsePositives.values()].reduce(
    (sum, count) => sum + count,
    0,
  );
  const rows = RULE_IDS.map(
    (ruleId) =>
      ruleId.padEnd(24) +
      " " +
      String(adversarialDetections.get(ruleId)).padStart(3) +
      " " +
      String(benignFalsePositives.get(ruleId)).padStart(3),
  );
  output.write(
    [
      "Shield corpus metrics (Node reference run; all inputs are captured testnet data)",
      "Rule                     Adversarial detections   Benign false positives",
      ...rows,
      "",
      `Adversarial: ${String(CLASSIC_CORPUS.length)} cases × 2 modes passed findings and decision gates.`,
      `Benign Mode A: ${String(benignCases.length)} cases passed; ${String(falsePositiveTotal)} unexpected findings, 0 high/critical findings.`,
      `analyze() latency: p50 ${percentile(referenceSamples, 50).toFixed(2)} ms; ` +
        `p95 ${percentile(referenceSamples, 95).toFixed(2)} ms (${String(referenceSamples.length)} reference samples).`,
      "Telemetry: none. This runner uses captured fixtures and makes no network requests.",
    ].join("\n") + "\n",
  );
}
