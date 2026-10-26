import { describe, expect, it } from "vitest";
import { StellixError } from "../../../errors.js";
import { accountSchema } from "../../../network/horizon-schemas.js";
import { FakeHorizonClient } from "../../../testing/fake-horizon.js";
import { MemoryKeyValueStore } from "../../../testing/memory-key-value-store.js";
import {
  fixture,
  lookup,
  marketFixture,
  marketTx,
  type MarketFixture,
} from "../../__fixtures__/load.js";
import { findingCopy } from "../../copy/index.js";
import { decodeTransactionEnvelope } from "../../decode/envelope.js";
import { analyze } from "../../index.js";
import { createTomlFetcher } from "../../intel/toml.js";
import type { ShieldDeps } from "../../types.js";
import { checkedTrustlines } from "../trust.js";

// Captured testnet cases (scripts/capture-shield-extra-fixtures.mjs trust): the issuer account
// as Horizon served it and the issuer's stellar.toml as its website served it, just before the
// user's changeTrust was submitted.

const NOW = Date.parse("2026-10-25T11:00:00Z");

interface Options {
  /** Replaces the issuer account lookup. */
  account?: StellixError | null | ((body: Record<string, unknown>) => Record<string, unknown>);
  /** Replaces the toml response. */
  toml?: Response | Error | "hang";
  userAccount?: string;
}

async function run(f: MarketFixture, opts: Options = {}) {
  const { envelopeXdr, userAccount } = marketTx(f);
  const horizon = new FakeHorizonClient();
  const issuerBody = lookup(f, "issuer").body as Record<string, unknown>;
  const issuerId = issuerBody.id as string;
  if (opts.account instanceof StellixError) horizon.failingAccounts.add(issuerId);
  else if (opts.account !== null) {
    const body = typeof opts.account === "function" ? opts.account(issuerBody) : issuerBody;
    horizon.accounts.set(issuerId, accountSchema.parse(body));
  }

  const tomlCalls: string[] = [];
  const captured = f.lookups.toml;
  const fetchFn = ((input: RequestInfo | URL, init?: RequestInit) => {
    tomlCalls.push(input instanceof Request ? input.url : input.toString());
    if (opts.toml === "hang") {
      return new Promise<Response>((_r, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    }
    if (opts.toml instanceof Error) return Promise.reject(opts.toml);
    if (opts.toml !== undefined) return Promise.resolve(opts.toml);
    if (captured === undefined) return Promise.reject(new Error("no toml captured"));
    return Promise.resolve(
      new Response(captured.text ?? "", {
        status: captured.status,
        headers: { "Content-Type": captured.headers?.["content-type"] ?? "text/plain" },
      }),
    );
  }) as typeof fetch;

  const deps: ShieldDeps = {
    horizon,
    toml: createTomlFetcher({
      fetch: fetchFn,
      session: new MemoryKeyValueStore(),
      now: () => NOW,
      timeoutMs: 10,
    }),
    userAccount: opts.userAccount ?? userAccount,
    now: () => NOW,
  };
  const report = await analyze(
    {
      kind: "transaction",
      xdr: envelopeXdr,
      network: "testnet",
      origin: { type: "pasted" },
      presented: { destinations: [] },
    },
    deps,
  );
  const of = (id: string) => ({
    findings: report.findings.filter((x) => x.ruleId === id),
    unavailable: report.checksUnavailable.filter((c) => c.ruleId === id),
  });
  return {
    horizon,
    tomlCalls,
    unverified: of("TRUST_UNVERIFIED"),
    clawback: of("TRUST_CLAWBACK"),
  };
}

const none = { findings: [], unavailable: [] };

describe("TRUST_UNVERIFIED / TRUST_CLAWBACK on captured issuers", () => {
  it("listed in its toml, clawback enabled: only TRUST_CLAWBACK fires", async () => {
    const f = marketFixture("trust-listed-clawback");
    const { unverified, clawback, tomlCalls } = await run(f);
    expect(tomlCalls).toEqual([lookup(f, "toml").path]);
    expect(unverified).toEqual(none);
    expect(clawback.unavailable).toEqual([]);
    expect(clawback.findings).toEqual([
      {
        ruleId: "TRUST_CLAWBACK",
        severity: "medium",
        confidence: "high",
        opIndex: 0,
        evidence: {
          opNumber: "1",
          assetCode: "SRT",
          issuer: "GCXWSVROJKVC7R5QODVRA3C4MLN4USLBQKK5H4GLJQ7KS7KTBREZQ7NN",
        },
      },
    ]);
    expect(findingCopy(clawback.findings[0]!).body).toContain("clawback enabled");
  });

  it("same code, another issuer claiming the domain: missing from CURRENCIES → fires", async () => {
    const f = marketFixture("trust-unlisted");
    const { unverified, clawback } = await run(f);
    expect(clawback).toEqual(none);
    expect(unverified.unavailable).toEqual([]);
    expect(unverified.findings).toHaveLength(1);
    expect(unverified.findings[0]).toMatchObject({
      ruleId: "TRUST_UNVERIFIED",
      severity: "medium",
      evidence: {
        opNumber: "1",
        assetCode: "SRT",
        issuer: (lookup(f, "issuer").body as { id: string }).id,
        verification:
          "The stellar.toml at 4344.staging.register.nyala.de doesn't list SRT with this issuer.",
      },
    });
    expect(findingCopy(unverified.findings[0]!).title).toBe(
      "Asset not verified by its issuer's website",
    );
  });

  it("issuer without a home domain → fires, and no toml is fetched", async () => {
    const { unverified, clawback, tomlCalls } = await run(marketFixture("trust-no-home-domain"));
    expect(tomlCalls).toEqual([]);
    expect(clawback).toEqual(none);
    expect(unverified.findings[0]?.evidence.verification).toBe(
      "The issuer account has no home domain, so no website vouches for this asset.",
    );
  });

  it("a home domain serving HTML (malformed toml) → unavailable, never a finding", async () => {
    const { unverified, clawback } = await run(marketFixture("trust-parked-domain"));
    expect(unverified).toEqual({
      findings: [],
      unavailable: [{ ruleId: "TRUST_UNVERIFIED", reason: "bad_response" }],
    });
    expect(clawback).toEqual(none);
  });
});

describe("TRUST_UNVERIFIED / TRUST_CLAWBACK failure paths", () => {
  const listed = () => marketFixture("trust-listed-clawback");

  it.each([
    ["timeout", "hang", "timeout"],
    ["network failure", new TypeError("Failed to fetch"), "unreachable"],
    ["404", new Response("", { status: 404 }), "not_found"],
    ["oversize body", new Response(`#${"x".repeat(200_000)}\n`), "bad_response"],
  ] as const)(
    "toml %s → TRUST_UNVERIFIED unavailable (%s), never a finding",
    async (_k, toml, reason) => {
      const { unverified, clawback } = await run(listed(), { toml });
      expect(unverified).toEqual({
        findings: [],
        unavailable: [{ ruleId: "TRUST_UNVERIFIED", reason }],
      });
      // The issuer's flags came from Horizon, so clawback is still known.
      expect(clawback.findings).toHaveLength(1);
    },
  );

  it("a refused home domain (IP literal) → unavailable, no request", async () => {
    const { unverified, tomlCalls } = await run(listed(), {
      account: (body) => ({ ...body, home_domain: "127.0.0.1" }),
    });
    expect(tomlCalls).toEqual([]);
    expect(unverified).toEqual({
      findings: [],
      unavailable: [{ ruleId: "TRUST_UNVERIFIED", reason: "bad_response" }],
    });
  });

  it("issuer lookup failing → both unavailable (unreachable)", async () => {
    const { unverified, clawback } = await run(listed(), {
      account: new StellixError("NETWORK_ERROR", "down", true),
    });
    expect(unverified.unavailable).toEqual([{ ruleId: "TRUST_UNVERIFIED", reason: "unreachable" }]);
    expect(clawback.unavailable).toEqual([{ ruleId: "TRUST_CLAWBACK", reason: "unreachable" }]);
  });

  it("issuer account missing → both unavailable (not_found)", async () => {
    const { unverified, clawback } = await run(listed(), { account: null });
    expect(unverified.unavailable).toEqual([{ ruleId: "TRUST_UNVERIFIED", reason: "not_found" }]);
    expect(clawback.unavailable).toEqual([{ ruleId: "TRUST_CLAWBACK", reason: "not_found" }]);
  });

  it("flags missing from Horizon's account → TRUST_CLAWBACK unavailable (bad_response)", async () => {
    const { clawback } = await run(listed(), {
      account: (body) => {
        const rest = { ...body };
        delete rest.flags;
        return rest;
      },
    });
    expect(clawback.unavailable).toEqual([{ ruleId: "TRUST_CLAWBACK", reason: "bad_response" }]);
  });

  it("a trustline from another account isn't checked, and nothing is fetched", async () => {
    const other = "GDX3XHNB6XNJBRMOWOP4ZQVKL5CFMXD4MJFXFICFVGR7J2KQXMDIANZD";
    const { unverified, clawback, horizon, tomlCalls } = await run(listed(), {
      userAccount: other,
    });
    expect(unverified).toEqual(none);
    expect(clawback).toEqual(none);
    expect(horizon.count("getAccount")).toBe(0);
    expect(tomlCalls).toEqual([]);
  });

  it("removing a trustline (limit 0) or a pool-share line isn't checked", () => {
    for (const name of ["changeTrust-remove", "changeTrust-pool-share"]) {
      const f = fixture(name);
      const decoded = decodeTransactionEnvelope(f.envelopeXdr, "testnet").decoded;
      expect(checkedTrustlines(decoded, f.transaction.body.source_account), name).toEqual([]);
    }
  });
});
