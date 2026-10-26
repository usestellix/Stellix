import { describe, expect, it } from "vitest";
import { StellixError } from "../../../errors.js";
import { accountSchema } from "../../../network/horizon-schemas.js";
import { FakeHorizonClient } from "../../../testing/fake-horizon.js";
import { lookup, marketFixture, marketTx, type MarketFixture } from "../../__fixtures__/load.js";
import { findingCopy } from "../../copy/index.js";
import { decodeTransactionEnvelope } from "../../decode/envelope.js";
import { gather } from "../../gather.js";
import { analyze, evaluate } from "../../index.js";
import type { ShieldDeps } from "../../types.js";
import { checkedMemoDestinations } from "../MEMO_REQUIRED.js";

// Captured testnet cases (scripts/capture-shield-extra-fixtures.mjs memo): the destination
// account as Horizon served it just before the transaction was submitted. The SEP-29 account
// has `config.memo_required` = "1" ("MQ==").

const NOW = Date.parse("2026-10-25T11:00:00Z");

interface Options {
  /** Replaces the destination account lookup. */
  account?: StellixError | null | ((body: Record<string, unknown>) => Record<string, unknown>);
}

async function run(f: MarketFixture, opts: Options = {}) {
  const { envelopeXdr, userAccount } = marketTx(f);
  const horizon = new FakeHorizonClient();
  for (const [key, captured] of Object.entries(f.lookups)) {
    const body = captured.body as Record<string, unknown>;
    const id = body.id as string;
    if (key === "destination" && opts.account !== undefined) {
      if (opts.account instanceof StellixError) horizon.failingAccounts.add(id);
      else if (opts.account !== null)
        horizon.accounts.set(id, accountSchema.parse(opts.account(body)));
    } else {
      horizon.accounts.set(id, accountSchema.parse(body));
    }
  }
  const deps: ShieldDeps = {
    horizon,
    toml: { fetchToml: () => Promise.reject(new Error("no toml in this test")) },
    userAccount,
    now: () => NOW,
  };
  const report = await analyze(
    {
      kind: "transaction",
      xdr: envelopeXdr,
      network: "testnet",
      origin: { type: "stellix" },
      presented: { destinations: [] },
    },
    deps,
  );
  return {
    horizon,
    report,
    findings: report.findings.filter((x) => x.ruleId === "MEMO_REQUIRED"),
    unavailable: report.checksUnavailable.filter((c) => c.ruleId === "MEMO_REQUIRED"),
  };
}

const destinationOf = (f: MarketFixture) => (lookup(f, "destination").body as { id: string }).id;

describe("MEMO_REQUIRED", () => {
  it.each([
    ["memo-payment-none", 0],
    ["memo-path-send-none", 0],
    ["memo-path-receive-none", 0],
    ["memo-merge-none", 0],
    ["memo-second-op", 1],
  ])("%s: no memo to a memo-required account fires", async (name, opIndex) => {
    const f = marketFixture(name);
    const { findings, unavailable } = await run(f);
    expect(unavailable).toEqual([]);
    expect(findings).toEqual([
      {
        ruleId: "MEMO_REQUIRED",
        severity: "high",
        confidence: "high",
        opIndex,
        evidence: { opNumber: String(opIndex + 1), destination: destinationOf(f) },
      },
    ]);
    expect(findingCopy(findings[0]!).body).toContain(destinationOf(f));
  });

  it("a memo-required finding blocks in every mode (policy)", async () => {
    const { report } = await run(marketFixture("memo-payment-none"));
    for (const origin of ["stellix", "dapp", "pasted"] as const) {
      expect(evaluate(report, { origin })).toEqual({
        state: "blocked",
        ruleIds: ["MEMO_REQUIRED"],
        overridable: false,
      });
    }
  });

  it("a text memo satisfies it, without a lookup", async () => {
    const { findings, unavailable, horizon } = await run(marketFixture("memo-payment-text"));
    expect([findings, unavailable]).toEqual([[], []]);
    expect(horizon.calls.filter((c) => c.method === "getAccount")).toEqual([]);
  });

  it("an M… destination is exempt, without a lookup", async () => {
    const { findings, unavailable, horizon } = await run(marketFixture("memo-payment-muxed"));
    expect([findings, unavailable]).toEqual([[], []]);
    expect(horizon.calls.filter((c) => c.method === "getAccount")).toEqual([]);
  });

  it("an account without the data entry doesn't fire", async () => {
    const { findings, unavailable } = await run(marketFixture("memo-payment-not-required"));
    expect([findings, unavailable]).toEqual([[], []]);
  });

  it("createAccount isn't checked (not a SEP-29 operation)", async () => {
    const f = marketFixture("memo-create-account");
    const decoded = decodeTransactionEnvelope(marketTx(f).envelopeXdr, "testnet").decoded;
    expect(checkedMemoDestinations(decoded)).toEqual([]);
    const { findings, unavailable } = await run(f);
    expect([findings, unavailable]).toEqual([[], []]);
  });

  it("a destination that doesn't exist requires no memo", async () => {
    const { findings, unavailable } = await run(marketFixture("memo-payment-none"), {
      account: null,
    });
    expect([findings, unavailable]).toEqual([[], []]);
  });

  it.each([
    ["0", { "config.memo_required": "MA==" }],
    ["not base64", { "config.memo_required": "%%%" }],
    ["absent", {}],
  ])("a data entry that isn't \"1\" (%s) doesn't fire", async (_label, data) => {
    const { findings, unavailable } = await run(marketFixture("memo-payment-none"), {
      account: (body) => ({ ...body, data }),
    });
    expect([findings, unavailable]).toEqual([[], []]);
  });

  it("a failed lookup is unavailable, never a pass, and blocks", async () => {
    const { report, findings, unavailable } = await run(marketFixture("memo-payment-none"), {
      account: new StellixError("NETWORK_ERROR", "down"),
    });
    expect(findings).toEqual([]);
    expect(unavailable).toEqual([{ ruleId: "MEMO_REQUIRED", reason: "unreachable" }]);
    expect(evaluate(report, { origin: "stellix" })).toMatchObject({ state: "blocked" });
  });

  it("looks each destination up once", async () => {
    const f = marketFixture("memo-payment-none");
    const { envelopeXdr, userAccount } = marketTx(f);
    const decoded = decodeTransactionEnvelope(envelopeXdr, "testnet").decoded;
    const op = decoded.operations[0]!;
    const horizon = new FakeHorizonClient();
    horizon.accounts.set(destinationOf(f), accountSchema.parse(lookup(f, "destination").body));
    const data = await gather(
      { ...decoded, operations: [op, op, op] },
      {
        horizon,
        toml: { fetchToml: () => Promise.reject(new Error("no toml in this test")) },
        userAccount,
        now: () => NOW,
      },
    );
    expect(data.memoRequired).toEqual(new Map([[destinationOf(f), true]]));
    expect(horizon.calls).toEqual([{ method: "getAccount", arg: destinationOf(f) }]);
  });
});
