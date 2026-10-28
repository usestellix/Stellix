import { describe, expect, it } from "vitest";
import { accountSchema, orderBookSchema, pathsPageSchema } from "../../network/horizon-schemas.js";
import { FakeHorizonClient } from "../../testing/fake-horizon.js";
import { MemoryKeyValueStore } from "../../testing/memory-key-value-store.js";
import {
  CLASSIC_CORPUS,
  CORPUS_NOW,
  type ClassicCorpusCase,
  type ClassicCorpusExpectation,
} from "../__corpus__/classic.js";
import { marketFixture } from "../__fixtures__/load.js";
import { decodeTransactionEnvelope } from "../decode/envelope.js";
import { analyze } from "../index.js";
import { createTomlFetcher } from "../intel/toml.js";
import { evaluate } from "../policy/policy.js";
import { checkedOffers } from "../rules/OFFER_BAD_PRICE.js";
import { checkedPathPayments } from "../rules/PATH_LOW_MIN.js";
import { checkedTrustlines } from "../rules/trust.js";
import type { Origin, PolicyDecision, ShieldDeps, ShieldRequest } from "../types.js";

function dependencies(testCase: ClassicCorpusCase): ShieldDeps {
  const horizon = new FakeHorizonClient();
  const market =
    testCase.marketFixture === undefined ? undefined : marketFixture(testCase.marketFixture);
  const decoded = decodeTransactionEnvelope(testCase.xdr, "testnet").decoded;

  if (market !== undefined) {
    const issuerLookup = market.lookups.issuer;
    if (issuerLookup !== undefined) {
      const account = accountSchema.parse(issuerLookup.body);
      horizon.accounts.set(account.id, account);
    }

    const orderBookLookup = market.lookups.orderBook;
    if (orderBookLookup !== undefined) {
      const orderBook = orderBookSchema.parse(orderBookLookup.body);
      for (const offer of checkedOffers(decoded, testCase.userAccount)) {
        horizon.orderBooks.set(
          FakeHorizonClient.orderBookKey(offer.selling, offer.buying),
          orderBook,
        );
      }
    }

    const pathsLookup = market.lookups.paths;
    if (pathsLookup !== undefined) {
      const records = pathsPageSchema.parse(pathsLookup.body)._embedded.records;
      for (const path of checkedPathPayments(decoded, testCase.userAccount)) {
        const key =
          path.mode === "strictSend"
            ? FakeHorizonClient.strictSendKey(path.sendAsset, path.fixedStroops, path.destAsset)
            : FakeHorizonClient.strictReceiveKey(path.sendAsset, path.destAsset, path.fixedStroops);
        horizon.paths.set(key, records);
      }
    }

    for (const trustline of checkedTrustlines(decoded, testCase.userAccount)) {
      const issuer = market.lookups.issuer?.body;
      if (issuer === undefined || trustline.issuer !== accountSchema.parse(issuer).id) {
        throw new Error(`${testCase.id} is missing the captured issuer account`);
      }
    }
  }

  const tomlLookup = market?.lookups.toml;
  const toml = createTomlFetcher({
    fetch: () => {
      if (tomlLookup === undefined) throw new Error(`${testCase.id} has no captured TOML`);
      return Promise.resolve(
        new Response(tomlLookup.text ?? "", {
          status: tomlLookup.status,
          headers: { "Content-Type": tomlLookup.headers?.["content-type"] ?? "text/plain" },
        }),
      );
    },
    session: new MemoryKeyValueStore(),
    now: () => CORPUS_NOW,
  });

  return {
    horizon,
    toml,
    userAccount: testCase.userAccount,
    now: () => CORPUS_NOW,
  };
}

function request(testCase: ClassicCorpusCase, origin: Origin): ShieldRequest {
  return {
    kind: "transaction",
    xdr: testCase.xdr,
    network: "testnet",
    origin,
    presented: {
      destinations: origin.type === "stellix" ? testCase.presentedInModeA : [],
    },
  };
}

async function expectMode(
  testCase: ClassicCorpusCase,
  origin: Extract<Origin, { type: "stellix" | "pasted" }>,
  expected: ClassicCorpusExpectation,
  deps: ShieldDeps,
): Promise<void> {
  const report = await analyze(request(testCase, origin), deps);
  expect(
    report.findings.map((finding) => finding.ruleId),
    `${testCase.id} findings in ${origin.type}`,
  ).toEqual(expected.findingIds);
  expect(report.checksUnavailable, `${testCase.id} unavailable checks in ${origin.type}`).toEqual(
    [],
  );

  const decision: PolicyDecision = evaluate(report, { origin: origin.type });
  expect(decision, `${testCase.id} decision in ${origin.type}`).toEqual(expected.decision);
  expect(decision.state, `${testCase.id} must not silently reach ready in ${origin.type}`).not.toBe(
    "ready",
  );
}

describe("classic adversarial corpus (SHIELD §10.2)", () => {
  it("covers the documented classic cases", () => {
    expect(CLASSIC_CORPUS.map(({ id }) => id)).toEqual([
      "payment-with-signer-add",
      "user-source-hidden-among-dapp-ops",
      "merge-with-harmless-payment",
      "offer-far-below-market",
      "path-payment-near-zero-minimum",
      "trustline-unverified-issuer",
      "trustline-clawback-enabled",
      "transaction-without-max-time",
      "fee-bump-with-large-max-fee",
      "unsupported-operation",
    ]);
  });

  it.each(CLASSIC_CORPUS)("$id: $description", async (testCase) => {
    const deps = dependencies(testCase);
    await expectMode(testCase, { type: "stellix" }, testCase.expected.stellix, deps);
    await expectMode(testCase, { type: "pasted" }, testCase.expected.pasted, deps);
  });
});
