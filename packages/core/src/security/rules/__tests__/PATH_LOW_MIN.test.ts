import { describe, expect, it } from "vitest";
import { StellixError } from "../../../errors.js";
import { pathsPageSchema, type PathRecord } from "../../../network/horizon-schemas.js";
import { FakeHorizonClient } from "../../../testing/fake-horizon.js";
import { lookup, marketFixture, marketTx, type MarketFixture } from "../../__fixtures__/load.js";
import { findingCopy } from "../../copy/index.js";
import { decodeTransactionEnvelope } from "../../decode/envelope.js";
import { analyze } from "../../index.js";
import type { ShieldDeps } from "../../types.js";
import { checkedPathPayments } from "../PATH_LOW_MIN.js";

// Captured testnet market fixtures: Horizon's routes just before the user's path payment was
// submitted. 10 XLM → MKT: the best route delivers 20 MKT; 10 MKT costs 5 XLM at best.

const NOW = Date.parse("2026-10-25T11:00:00Z");

function records(f: MarketFixture): PathRecord[] {
  return pathsPageSchema.parse(lookup(f, "paths").body)._embedded.records;
}

async function run(
  f: MarketFixture,
  result: PathRecord[] | StellixError = records(f),
  userAccount = marketTx(f).userAccount,
) {
  const { envelopeXdr } = marketTx(f);
  const horizon = new FakeHorizonClient();
  const decoded = decodeTransactionEnvelope(envelopeXdr, "testnet").decoded;
  for (const p of checkedPathPayments(decoded, marketTx(f).userAccount)) {
    horizon.paths.set(
      p.mode === "strictSend"
        ? FakeHorizonClient.strictSendKey(p.sendAsset, p.fixedStroops, p.destAsset)
        : FakeHorizonClient.strictReceiveKey(p.sendAsset, p.destAsset, p.fixedStroops),
      result,
    );
  }
  const deps: ShieldDeps = {
    horizon,
    toml: { fetchToml: () => Promise.reject(new Error("no toml in this test")) },
    userAccount,
    now: () => NOW,
  };
  const report = await analyze(
    { kind: "transaction", xdr: envelopeXdr, network: "testnet", origin: { type: "pasted" } },
    deps,
  );
  return {
    horizon,
    findings: report.findings.filter((x) => x.ruleId === "PATH_LOW_MIN"),
    unavailable: report.checksUnavailable.filter((c) => c.ruleId === "PATH_LOW_MIN"),
  };
}

describe("PATH_LOW_MIN", () => {
  it("strict send with a near-zero destMin fires", async () => {
    const { findings, unavailable } = await run(marketFixture("path-send-near-zero-min"));
    expect(unavailable).toEqual([]);
    expect(findings).toEqual([
      {
        ruleId: "PATH_LOW_MIN",
        severity: "high",
        confidence: "high",
        opIndex: 0,
        evidence: {
          opNumber: "1",
          sendAsset: "XLM",
          destAsset: "MKT",
          limitKind: "minimum to receive",
          limitAmount: "0.0000001",
          limitAsset: "MKT",
          bestAmount: "20",
          lossAmount: "19.9999999",
          lossBps: "9999",
          lossPercent: "99.99",
        },
      },
    ]);
    expect(findingCopy(findings[0]!).body).toContain("best route Horizon found is 20 MKT");
  });

  it("strict receive with sendMax 10% above the best route fires", async () => {
    const { findings } = await run(marketFixture("path-receive-10pct-max"));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence).toMatchObject({
      limitKind: "maximum to send",
      limitAmount: "5.5",
      limitAsset: "XLM",
      bestAmount: "5",
      lossAmount: "0.5",
      lossBps: "1000",
      lossPercent: "10",
    });
  });

  it.each(["path-send-1pct-min", "path-receive-1pct-max"])(
    "%s: a 1%% allowance doesn't fire",
    async (name) => {
      const { findings, unavailable, horizon } = await run(marketFixture(name));
      expect(findings).toEqual([]);
      expect(unavailable).toEqual([]);
      expect(horizon.count("findPaths")).toBe(1);
    },
  );

  it("no route (captured empty result) → unavailable, not_found", async () => {
    const empty = records(marketFixture("path-no-route"));
    expect(empty).toEqual([]);
    const { findings, unavailable } = await run(marketFixture("path-send-near-zero-min"), empty);
    expect(findings).toEqual([]);
    expect(unavailable).toEqual([{ ruleId: "PATH_LOW_MIN", reason: "not_found" }]);
  });

  it("routes for other assets are ignored → not_found", async () => {
    const f = marketFixture("path-send-near-zero-min");
    const other = records(f).map((r) => ({ ...r, destination_asset_code: "OTHER" }));
    const { unavailable } = await run(f, other);
    expect(unavailable).toEqual([{ ruleId: "PATH_LOW_MIN", reason: "not_found" }]);
  });

  it.each([
    [new StellixError("NETWORK_ERROR", "down", true), "unreachable"],
    [new StellixError("RATE_LIMITED", "limit", true), "unreachable"],
    [new StellixError("HORIZON_BAD_RESPONSE", "bad"), "bad_response"],
  ] as const)("an unavailable path service (%s) → unavailable, %s", async (error, reason) => {
    const { findings, unavailable } = await run(marketFixture("path-send-near-zero-min"), error);
    expect(findings).toEqual([]);
    expect(unavailable).toEqual([{ ruleId: "PATH_LOW_MIN", reason }]);
  });

  it("ignores path payments whose effective source isn't the user", async () => {
    const other = "GDX3XHNB6XNJBRMOWOP4ZQVKL5CFMXD4MJFXFICFVGR7J2KQXMDIANZD";
    const f = marketFixture("path-send-near-zero-min");
    const { findings, unavailable, horizon } = await run(f, records(f), other);
    expect(findings).toEqual([]);
    expect(unavailable).toEqual([]);
    expect(horizon.count("findPaths")).toBe(0);
  });
});
