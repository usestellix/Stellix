import { describe, expect, it } from "vitest";
import { createHorizonClient } from "../horizon-client.js";
import {
  accountSchema,
  feeStatsSchema,
  ledgerPageSchema,
  nativeBalanceOf,
  problemSchema,
  rootSchema,
} from "../horizon-schemas.js";
import { fixture, fromFixture, json, scriptedFetch } from "./fixtures.js";

const BASE = "https://horizon-testnet.stellar.org";
const noSleep = () => Promise.resolve();

async function codeOf(p: Promise<unknown>) {
  return p.then(
    () => undefined,
    (e: unknown) => e as { code?: string; retryable?: boolean },
  );
}

describe("schemas parse every captured fixture", () => {
  it.each([
    ["root", rootSchema],
    ["ledgers-latest", ledgerPageSchema],
    ["fee-stats", feeStatsSchema],
    ["account-funded", accountSchema],
    ["account-multi-subentry", accountSchema],
    ["account-not-found", problemSchema],
    ["friendbot-already-funded", problemSchema],
  ] as const)("%s", (name, schema) => {
    expect(schema.safeParse(fixture(name).body).success).toBe(true);
  });

  it("finds the native balance and keeps unknown fields", () => {
    const account = accountSchema.parse(fixture("account-funded").body);
    expect(nativeBalanceOf(account)?.balance).toBe("10000.0000000");
    expect(account).toHaveProperty("_links");
  });

  it("rejects an account with a non-7-decimal balance", () => {
    const body = structuredClone(fixture("account-funded").body) as {
      balances: { balance: string }[];
    };
    body.balances[0]!.balance = "10000";
    expect(accountSchema.safeParse(body).success).toBe(false);
  });
});

describe("createHorizonClient", () => {
  it("reads the latest ledger with only an Accept header", async () => {
    const f = scriptedFetch([fromFixture("ledgers-latest")]);
    const ledger = await createHorizonClient(BASE, f, { sleep: noSleep }).getLatestLedger();
    expect(ledger.base_reserve_in_stroops).toBe(5_000_000);
    expect(f.calls[0]!.url).toBe(`${BASE}/ledgers?order=desc&limit=1`);
    expect(f.calls[0]!.init?.headers).toEqual({ Accept: "application/json" });
  });

  it("handles a base URL with or without a trailing slash", async () => {
    const f = scriptedFetch([fromFixture("root")]);
    await createHorizonClient(`${BASE}/`, f, { sleep: noSleep }).getRoot();
    expect(f.calls[0]!.url).toBe(`${BASE}/`);
  });

  it("returns null for an unfunded account (404 is a state)", async () => {
    const f = scriptedFetch([fromFixture("account-not-found")]);
    expect(await createHorizonClient(BASE, f, { sleep: noSleep }).getAccount("GABC")).toBeNull();
  });

  it("404 on a required resource → HORIZON_NOT_FOUND", async () => {
    const f = scriptedFetch([json(404, {})]);
    expect(
      (await codeOf(createHorizonClient(BASE, f, { sleep: noSleep }).getFeeStats()))?.code,
    ).toBe("HORIZON_NOT_FOUND");
  });

  it("retries 5xx with backoff, then succeeds", async () => {
    const slept: number[] = [];
    const f = scriptedFetch([json(503, {}), json(502, {}), fromFixture("fee-stats")]);
    const client = createHorizonClient(BASE, f, {
      sleep: (ms) => {
        slept.push(ms);
        return Promise.resolve();
      },
    });
    await client.getFeeStats();
    expect(f.calls).toHaveLength(3);
    expect(slept[0]).toBeGreaterThanOrEqual(500);
    expect(slept[0]).toBeLessThan(750);
    expect(slept[1]).toBeGreaterThanOrEqual(1_000);
    expect(slept[1]).toBeLessThan(1_250);
  });

  it("gives up after 3 retries → NETWORK_ERROR (retryable)", async () => {
    const f = scriptedFetch([json(500, {}), json(500, {}), json(500, {}), json(500, {})]);
    const err = await codeOf(createHorizonClient(BASE, f, { sleep: noSleep }).getRoot());
    expect(err).toMatchObject({ code: "NETWORK_ERROR", retryable: true });
    expect(f.calls).toHaveLength(4);
  });

  it("retries transport errors and timeouts", async () => {
    const f = scriptedFetch([
      new TypeError("Failed to fetch"),
      new DOMException("aborted", "AbortError"),
      fromFixture("root"),
    ]);
    await createHorizonClient(BASE, f, { sleep: noSleep }).getRoot();
    expect(f.calls).toHaveLength(3);
  });

  it("aborts a hung request after the timeout", async () => {
    let signal: AbortSignal | undefined;
    const fetchFn = ((_: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    }) as typeof fetch;
    const err = await codeOf(
      createHorizonClient(BASE, { fetch: fetchFn }, { sleep: noSleep, timeoutMs: 5 }).getRoot(),
    );
    expect(signal?.aborted).toBe(true);
    expect(err?.code).toBe("NETWORK_ERROR");
  });

  it("honours Retry-After ≤ 10 s on 429", async () => {
    const slept: number[] = [];
    const f = scriptedFetch([json(429, {}, { "Retry-After": "2" }), fromFixture("root")]);
    await createHorizonClient(BASE, f, {
      sleep: (ms) => {
        slept.push(ms);
        return Promise.resolve();
      },
    }).getRoot();
    expect(slept).toEqual([2_000]);
  });

  it("429 with a long or missing Retry-After → RATE_LIMITED", async () => {
    for (const headers of [
      { "Retry-After": "60" },
      {},
      { "Retry-After": "Wed, 21 Oct 2026 07:28:00 GMT" },
    ]) {
      const f = scriptedFetch([json(429, {}, headers)]);
      expect((await codeOf(createHorizonClient(BASE, f, { sleep: noSleep }).getRoot()))?.code).toBe(
        "RATE_LIMITED",
      );
    }
  });

  it.each([
    ["a 400", () => json(400, { type: "x", title: "Bad", status: 400 })],
    ["invalid JSON", () => new Response("<html>", { status: 200 })],
    ["a schema mismatch", () => json(200, { network_passphrase: 1 })],
  ])("maps %s to HORIZON_BAD_RESPONSE without retrying", async (_name, make) => {
    const f = scriptedFetch([make()]);
    expect((await codeOf(createHorizonClient(BASE, f, { sleep: noSleep }).getRoot()))?.code).toBe(
      "HORIZON_BAD_RESPONSE",
    );
    expect(f.calls).toHaveLength(1);
  });

  it("URL-encodes the account id", async () => {
    const f = scriptedFetch([fromFixture("account-not-found")]);
    await createHorizonClient(BASE, f, { sleep: noSleep }).getAccount("G/../x");
    expect(f.calls[0]!.url).toBe(`${BASE}/accounts/G%2F..%2Fx`);
  });
});
