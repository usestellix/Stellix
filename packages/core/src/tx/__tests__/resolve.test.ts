import { describe, expect, it } from "vitest";
import type { TransactionRecord } from "../../network/horizon-schemas.js";
import { fixture } from "../../network/__tests__/fixtures.js";
import { FakeHorizonClient } from "../../testing/fake-horizon.js";
import { RESOLVE_GRACE_MS, resolveTransaction } from "../resolve.js";

const HASH = "b".repeat(64);
const success = fixture("transaction-success").body as TransactionRecord;
const failedTx = fixture("transaction-failed").body as TransactionRecord;

function clock(startMs: number) {
  let now = startMs;
  return {
    now: () => now,
    sleep: (ms: number) => {
      now += ms;
      return Promise.resolve();
    },
  };
}

describe("resolveTransaction (TRANSACTIONS §5, §10)", () => {
  const maxTime = 1_000; // seconds
  const before = maxTime * 1000 - 60_000;

  it("found immediately → success", async () => {
    const h = new FakeHorizonClient();
    h.transactions.set(HASH, { ...success, ledger: 42 });
    const c = clock(before);
    expect(
      await resolveTransaction({
        horizon: h,
        hash: HASH,
        maxTimeSeconds: maxTime,
        ...c,
        budgetMs: 60_000,
      }),
    ).toEqual({
      kind: "success",
      ledger: 42,
    });
  });

  it("found after N polls, with 2/3/5 s backoff", async () => {
    const h = new FakeHorizonClient();
    let polls = 0;
    const c = clock(before);
    const sleeps: number[] = [];
    const result = await resolveTransaction({
      horizon: h,
      hash: HASH,
      maxTimeSeconds: maxTime,
      now: c.now,
      sleep: (ms) => {
        sleeps.push(ms);
        return c.sleep(ms);
      },
      budgetMs: 120_000,
      onPoll: () => {
        if (++polls === 4) h.transactions.set(HASH, success);
        return Promise.resolve();
      },
    });
    expect(result.kind).toBe("success");
    expect(sleeps).toEqual([2_000, 3_000, 5_000]);
  });

  it("failed in a ledger → failed with decoded codes", async () => {
    const h = new FakeHorizonClient();
    h.transactions.set(HASH, failedTx);
    expect(
      await resolveTransaction({
        horizon: h,
        hash: HASH,
        maxTimeSeconds: maxTime,
        ...clock(before),
        budgetMs: 10_000,
      }),
    ).toEqual({
      kind: "failed",
      codes: { transaction: "tx_failed", operations: ["op_no_destination"] },
    });
  });

  it("never found → expired only after maxTime + 15 s", async () => {
    const h = new FakeHorizonClient();
    const c = clock(maxTime * 1000 + RESOLVE_GRACE_MS - 4_000);
    expect(
      await resolveTransaction({
        horizon: h,
        hash: HASH,
        maxTimeSeconds: maxTime,
        ...c,
        budgetMs: 60_000,
      }),
    ).toEqual({ kind: "expired" });
    expect(c.now()).toBeGreaterThan(maxTime * 1000 + RESOLVE_GRACE_MS);
  });

  it("network errors during polling don't conclude anything, even past the deadline", async () => {
    const h = new FakeHorizonClient();
    h.transactionFailures = 100;
    const c = clock(maxTime * 1000 + 60_000);
    expect(
      await resolveTransaction({
        horizon: h,
        hash: HASH,
        maxTimeSeconds: maxTime,
        ...c,
        budgetMs: 20_000,
      }),
    ).toEqual({ kind: "pending" });
  });

  it("network errors then found → success", async () => {
    const h = new FakeHorizonClient();
    h.transactionFailures = 2;
    h.transactions.set(HASH, success);
    expect(
      (
        await resolveTransaction({
          horizon: h,
          hash: HASH,
          maxTimeSeconds: maxTime,
          ...clock(before),
          budgetMs: 60_000,
        })
      ).kind,
    ).toBe("success");
  });

  it("stops at the budget and reports pending", async () => {
    const h = new FakeHorizonClient();
    const c = clock(before);
    expect(
      await resolveTransaction({
        horizon: h,
        hash: HASH,
        maxTimeSeconds: maxTime,
        ...c,
        budgetMs: 20_000,
      }),
    ).toEqual({ kind: "pending" });
    expect(c.now() - before).toBeLessThanOrEqual(20_000);
  });

  it("calls whilePending between polls (resubmit hook)", async () => {
    const h = new FakeHorizonClient();
    let resubmits = 0;
    await resolveTransaction({
      horizon: h,
      hash: HASH,
      maxTimeSeconds: maxTime,
      ...clock(before),
      budgetMs: 6_000,
      whilePending: () => {
        resubmits++;
        return Promise.resolve();
      },
    });
    expect(resubmits).toBeGreaterThan(0);
  });
});
