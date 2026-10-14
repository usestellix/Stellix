import { describe, expect, it } from "vitest";
import { createHorizonClient } from "../horizon-client.js";
import { fixture, fromFixture, json, scriptedFetch } from "./fixtures.js";

const BASE = "https://horizon-testnet.stellar.org";
const noSleep = () => Promise.resolve();
const HASH = "a".repeat(64);

describe("submitTransactionAsync (ADR 0007)", () => {
  it("POSTs the envelope as a form to /transactions_async and returns PENDING", async () => {
    const f = scriptedFetch([fromFixture("submit-async-pending")]);
    const res = await createHorizonClient(BASE, f, { sleep: noSleep }).submitTransactionAsync(
      "AAAA+/=",
    );
    expect(res.tx_status).toBe("PENDING");
    expect(f.calls[0]!.url).toBe(`${BASE}/transactions_async`);
    expect(f.calls[0]!.init?.method).toBe("POST");
    expect(f.calls[0]!.init?.body).toBe("tx=AAAA%2B%2F%3D");
  });

  it("returns ERROR with error_result_xdr (captured bad-seq)", async () => {
    const f = scriptedFetch([fromFixture("submit-async-bad-seq")]);
    const res = await createHorizonClient(BASE, f, { sleep: noSleep }).submitTransactionAsync("x");
    expect(res).toMatchObject({
      tx_status: "ERROR",
      error_result_xdr: expect.any(String) as string,
    });
  });

  it.each([
    ["DUPLICATE", 409],
    ["TRY_AGAIN_LATER", 503],
  ])("returns %s", async (status, http) => {
    const f = scriptedFetch([json(http, { tx_status: status, hash: HASH })]);
    expect(
      (await createHorizonClient(BASE, f, { sleep: noSleep }).submitTransactionAsync("x"))
        .tx_status,
    ).toBe(status);
  });

  it.each([
    ["a transport error", () => new TypeError("Failed to fetch")],
    ["a 502 without a status body", () => new Response("bad gateway", { status: 502 })],
    ["an unknown status", () => json(201, { tx_status: "WHATEVER", hash: HASH })],
  ])("%s → NETWORK_ERROR (outcome unknown), never retried", async (_n, make) => {
    const f = scriptedFetch([make()]);
    await expect(
      createHorizonClient(BASE, f, { sleep: noSleep }).submitTransactionAsync("x"),
    ).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      retryable: true,
    });
    expect(f.calls).toHaveLength(1);
  });
});

describe("getTransaction / getPayments", () => {
  it("parses a captured transaction and returns null for 404", async () => {
    const f = scriptedFetch([
      fromFixture("transaction-success"),
      fromFixture("transaction-not-found"),
    ]);
    const client = createHorizonClient(BASE, f, { sleep: noSleep });
    expect(await client.getTransaction(HASH)).toMatchObject({ successful: true });
    expect(await client.getTransaction(HASH)).toBeNull();
  });

  it("reads a captured payments page; caps limit at 200; unfunded → []", async () => {
    const f = scriptedFetch([fromFixture("payments-page"), fromFixture("account-not-found")]);
    const client = createHorizonClient(BASE, f, { sleep: noSleep });
    const records = await client.getPayments("GABC", 999);
    expect(records.map((r) => r.type)).toEqual(
      (
        fixture("payments-page").body as { _embedded: { records: { type: string }[] } }
      )._embedded.records.map((r) => r.type),
    );
    expect(f.calls[0]!.url).toBe(`${BASE}/accounts/GABC/payments?order=desc&limit=200`);
    expect(await client.getPayments("GNEW", 10)).toEqual([]);
  });
});
