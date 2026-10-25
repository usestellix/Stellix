/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { FakeHorizonClient } from "../../testing/fake-horizon.js";
import { analyze } from "../index.js";
import { REPORT_TTL_MS, reportExpiresAt } from "../report.js";
import { RULE_SET_VERSION } from "../rules/index.js";
import type { ShieldDeps, ShieldRequest } from "../types.js";

interface OpFixture {
  name: string;
  opTypes: string[];
  envelopeType: "envelopeTypeTx" | "envelopeTypeTxFeeBump";
  networkPassphrase: string;
  hash: string;
  envelopeXdr: string;
}

// Captured from testnet by scripts/capture-shield-fixtures.mjs (TESTING §1).
const FIXTURES = Object.values(
  import.meta.glob<OpFixture>(["../__fixtures__/ops/*.json", "!**/_index.json"], {
    eager: true,
    import: "default",
  }),
);

function fixture(name: string): OpFixture {
  const f = FIXTURES.find((x) => x.name === name);
  if (f === undefined) throw new Error(`no fixture ${name}`);
  return f;
}

// Mid-capture time: the fixtures' maxTime is in the future, so the TTL decides expiry.
const NOW = Date.parse("2026-10-25T11:00:00Z");

function deps(): ShieldDeps {
  return {
    horizon: new FakeHorizonClient(),
    toml: {
      fetchToml: () => Promise.reject(new Error("no toml in this test")),
    },
    userAccount: "GUSER",
    now: () => NOW,
  };
}

function txRequest(xdr: string): ShieldRequest {
  return { kind: "transaction", xdr, network: "testnet", origin: { type: "pasted" } };
}

describe("analyze", () => {
  it("decodes every captured classic fixture, with its hash as the digest", async () => {
    expect(FIXTURES.length).toBeGreaterThan(40);
    for (const f of FIXTURES) {
      const report = await analyze(txRequest(f.envelopeXdr), deps());
      expect(report.digest, f.name).toBe(f.hash);
      expect(
        report.decoded.operations.map((op) => op.opType),
        f.name,
      ).toEqual(f.opTypes);
      expect(report.decoded.envelopeType, f.name).toBe(
        f.envelopeType === "envelopeTypeTxFeeBump" ? "txFeeBump" : "tx",
      );
    }
  });

  it("builds a report with no findings while the registry is empty", async () => {
    const report = await analyze(txRequest(fixture("payment-native").envelopeXdr), deps());
    expect(report).toMatchObject({
      network: "testnet",
      origin: { type: "pasted" },
      ruleSetVersion: RULE_SET_VERSION,
      simulation: { status: "not_applicable" },
      findings: [],
      checksUnavailable: [],
      createdAt: NOW,
    });
  });

  it("uses the fee-bump hash as the digest for a fee bump", async () => {
    const f = fixture("feeBump");
    const report = await analyze(txRequest(f.envelopeXdr), deps());
    expect(report.decoded.envelopeType).toBe("txFeeBump");
    expect(report.digest).toBe(f.hash);
  });

  it("caps expiry at createdAt + REPORT_TTL_MS when maxTime is absent", async () => {
    const report = await analyze(
      txRequest(fixture("preconditions-no-max-time").envelopeXdr),
      deps(),
    );
    expect(report.decoded.maxTime).toBeNull();
    expect(report.expiresAt).toBe(NOW + REPORT_TTL_MS);
  });

  it("digests under the request's network: the same XDR on mainnet gives another hash", async () => {
    const f = fixture("payment-native");
    const report = await analyze({ ...txRequest(f.envelopeXdr), network: "mainnet" }, deps());
    expect(report.digest).not.toBe(f.hash);
    expect(report.network).toBe("mainnet");
  });

  it.each(["", "not base64 !!", "AAAA", fixture("payment-native").envelopeXdr.slice(0, 40)])(
    "rejects malformed input with SHIELD_INPUT_INVALID (%#)",
    async (xdr) => {
      await expect(analyze(txRequest(xdr), deps())).rejects.toMatchObject({
        code: "SHIELD_INPUT_INVALID",
      });
    },
  );

  it("accepts only the canonical base64 spelling of an envelope", async () => {
    const xdr = fixture("payment-native").envelopeXdr;
    const lenient = [
      `${xdr.slice(0, 20)}\n${xdr.slice(20)}`,
      xdr.replace(/=+$/, ""),
      ` ${xdr}`,
      xdr.replace(/\+/g, "-").replace(/\//g, "_"),
    ];
    for (const variant of lenient) {
      if (variant === xdr) continue; // no '+', '/' or padding to change in this fixture
      await expect(analyze(txRequest(variant), deps())).rejects.toMatchObject({
        code: "SHIELD_INPUT_INVALID",
      });
    }
  });

  it("rejects request kinds that arrive in later phases", async () => {
    await expect(
      analyze(
        { kind: "message", message: "hi", network: "testnet", origin: { type: "pasted" } },
        deps(),
      ),
    ).rejects.toMatchObject({ code: "SHIELD_INPUT_INVALID" });
  });
});

describe("reportExpiresAt", () => {
  it("is the TTL end when there is no maxTime", () => {
    expect(reportExpiresAt(1_000_000, null)).toBe(1_000_000 + REPORT_TTL_MS);
  });

  it("is maxTime (in ms) when that comes first", () => {
    expect(reportExpiresAt(1_000_000, 1_100n)).toBe(1_100_000);
  });

  it("is the TTL end when maxTime is later, even at the uint64 maximum", () => {
    expect(reportExpiresAt(1_000_000, 2n ** 64n - 1n)).toBe(1_000_000 + REPORT_TTL_MS);
  });
});
