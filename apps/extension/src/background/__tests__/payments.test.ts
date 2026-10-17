import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk/base";
import {
  DEFAULT_SCRYPT_PARAMS,
  NETWORKS,
  createLogger,
  type AccountRecord,
  type TransactionRecord,
  NETWORK_IDS,
} from "@stellix/core";
import { FakeHorizonClient, createFakePlatform } from "@stellix/core/testing";
import { describe, expect, it, vi } from "vitest";
import accountFunded from "../../../../../packages/core/src/__fixtures__/horizon/account-funded.json" with { type: "json" };
import feeStats from "../../../../../packages/core/src/__fixtures__/horizon/fee-stats.json" with { type: "json" };
import txSuccess from "../../../../../packages/core/src/__fixtures__/horizon/transaction-success.json" with { type: "json" };
import { SEP0005_VECTORS } from "../../../../../packages/core/src/keys/__tests__/sep0005.vectors.js";
import type { RequestType } from "../../messaging/protocol.js";
import { handleMessage } from "../../messaging/router.js";
import { createAutoLock } from "../autolock.js";
import { createHandlers, createTouchActivity } from "../handlers.js";
import { RESOLVE_ALARM, createInflightResolver } from "../inflight.js";
import { createFakeAlarms } from "./fake-alarms.js";

// Payments through the real router, handlers, serial queue and core send service.

const BASE = "chrome-extension://abcdefghijklmnop/";
const POPUP = { id: "abcdefghijklmnop", url: `${BASE}popup.html` };
const ONBOARDING = { id: "abcdefghijklmnop", url: `${BASE}onboarding.html` };
const TEST5 = SEP0005_VECTORS.find((v) => v.test === 5)!;
const G0 = TEST5.accounts[0]!.publicKey;
const DEST = Keypair.random().publicKey();

const hashOf = (xdr: string) =>
  Buffer.from(TransactionBuilder.fromXdr(xdr, NETWORKS.testnet.passphrase).hash()).toString("hex");

async function setup() {
  const platform = createFakePlatform(Date.now());
  const h = new FakeHorizonClient();
  const account = (id: string): AccountRecord => ({
    ...(accountFunded.body as unknown as AccountRecord),
    id,
    sequence: "500",
    signers: [{ key: id, weight: 1, type: "ed25519_public_key" }],
  });
  h.accounts.set(G0, account(G0));
  h.accounts.set(DEST, account(DEST));
  h.ledger = {
    sequence: 1,
    base_reserve_in_stroops: 5_000_000,
    base_fee_in_stroops: 100,
    closed_at: "",
  };
  h.feeStats = feeStats.body;
  const sleep = (ms: number) => {
    platform.advance(ms);
    return Promise.resolve();
  };
  const fakeAlarms = createFakeAlarms();
  const autoLock = createAutoLock(platform, fakeAlarms.api);
  const inflight = createInflightResolver(platform, fakeAlarms.api, () =>
    Promise.resolve({ horizonFor: () => h, sleep }),
  );
  const deps = {
    handlers: createHandlers({
      platform,
      autoLock,
      inflight,
      sleep,
      openOnboarding: vi.fn(() => Promise.resolve()),
      onboarding: { scryptParams: { ...DEFAULT_SCRYPT_PARAMS, N: 2 ** 15 } },
      devBuild: false,
      enabledNetworks: NETWORK_IDS,
      horizonFor: () => h,
    }),
    sender: { runtimeId: "abcdefghijklmnop", extensionBaseUrl: BASE },
    ready: Promise.resolve(),
    touchActivity: createTouchActivity(platform, autoLock),
    log: createLogger({ minLevel: "error", sink: () => undefined }),
  };
  let n = 0;
  const send = async (type: RequestType, payload?: unknown, sender = POPUP) => {
    const id = `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
    return handleMessage({ id, type, payload }, sender, deps);
  };
  expect(
    await send(
      "ONBOARD_IMPORT",
      { mnemonic: TEST5.mnemonic, password: "correct horse battery" },
      ONBOARDING,
    ),
  ).toMatchObject({ ok: true });
  return { platform, h, send, fakeAlarms, sleep };
}

function landOnSubmit(h: FakeHorizonClient) {
  h.submitTransactionAsync = (xdr) => {
    const hash = hashOf(xdr);
    h.calls.push({ method: "submitTransactionAsync" });
    h.transactions.set(hash, {
      ...(txSuccess.body as unknown as TransactionRecord),
      hash,
      ledger: 900,
    });
    return Promise.resolve({ tx_status: "PENDING" as const, hash });
  };
}

describe("payments through the service worker", () => {
  it("prepare → confirm → success; GET_STATUS shows the outcome without any XDR", async () => {
    const { h, send } = await setup();
    landOnSubmit(h);
    const prepared = await send("PREPARE_PAYMENT", { destination: DEST, amount: "3" });
    expect(prepared).toMatchObject({
      ok: true,
      data: { summary: { kind: "payment", amountStroops: "30000000" } },
    });
    const { preparedId } = (prepared as { data: { preparedId: string } }).data;
    expect(await send("CONFIRM_PAYMENT", { preparedId })).toMatchObject({
      ok: true,
      data: { status: "success", ledger: 900 },
    });
    const status = await send("GET_STATUS");
    expect(status).toMatchObject({
      ok: true,
      data: { inflight: [{ status: "done", outcome: { status: "success" } }] },
    });
    expect(JSON.stringify(status)).not.toMatch(/AAAA[A-Za-z0-9+/]{40,}/); // no envelope XDR
  });

  it("two concurrent confirms on one preparedId → exactly one submit; the other gets PREPARED_TX_NOT_FOUND", async () => {
    const { h, send } = await setup();
    landOnSubmit(h);
    const prepared = (await send("PREPARE_PAYMENT", { destination: DEST, amount: "3" })) as {
      data: { preparedId: string };
    };
    const [a, b] = await Promise.all([
      send("CONFIRM_PAYMENT", { preparedId: prepared.data.preparedId }),
      send("CONFIRM_PAYMENT", { preparedId: prepared.data.preparedId }),
    ]);
    const results = [a, b]
      .map((r) => (r.ok ? `ok:${(r.data as { status: string }).status}` : r.error.code))
      .sort();
    expect(results).toEqual(["PREPARED_TX_NOT_FOUND", "ok:success"]);
    expect(h.count("submitTransactionAsync")).toBe(1);
  });

  it("INSUFFICIENT_BALANCE carries maxSendableStroops across messaging", async () => {
    const { send } = await setup();
    const res = await send("PREPARE_PAYMENT", { destination: DEST, amount: "10000" });
    expect(res).toMatchObject({
      ok: false,
      error: {
        code: "INSUFFICIENT_BALANCE",
        details: { maxSendableStroops: expect.stringMatching(/^\d+$/) as string },
      },
    });
  });

  it("still pending after ~20 s → {status: pending}, the resolve alarm is set, TX_IN_FLIGHT until it resolves", async () => {
    const { platform, h, send, fakeAlarms, sleep } = await setup();
    let hash = "";
    h.submitTransactionAsync = (xdr) => {
      hash = hashOf(xdr);
      return Promise.resolve({ tx_status: "PENDING" as const, hash });
    };
    const prepared = (await send("PREPARE_PAYMENT", { destination: DEST, amount: "3" })) as {
      data: { preparedId: string };
    };
    expect(await send("CONFIRM_PAYMENT", { preparedId: prepared.data.preparedId })).toEqual(
      expect.objectContaining({ ok: true, data: { status: "pending", hash } }),
    );
    expect(fakeAlarms.alarms.has(RESOLVE_ALARM)).toBe(true);
    expect(await send("PREPARE_PAYMENT", { destination: DEST, amount: "1" })).toMatchObject({
      ok: false,
      error: { code: "TX_IN_FLIGHT" },
    });

    // The tx lands; a fresh resolver over the same storage (as after a worker restart) resumes.
    h.transactions.set(hash, { ...(txSuccess.body as unknown as TransactionRecord), hash });
    await createInflightResolver(platform, fakeAlarms.api, () =>
      Promise.resolve({ horizonFor: () => h, sleep }),
    ).resume();
    expect(await send("GET_STATUS")).toMatchObject({
      data: { inflight: [{ hash, status: "done", outcome: { status: "success" } }] },
    });
    expect(fakeAlarms.alarms.has(RESOLVE_ALARM)).toBe(false);
    expect(await send("PREPARE_PAYMENT", { destination: DEST, amount: "1" })).toMatchObject({
      ok: true,
    });
  });

  it("DISMISS_OUTCOME removes a finished outcome", async () => {
    const { h, send } = await setup();
    landOnSubmit(h);
    const prepared = (await send("PREPARE_PAYMENT", { destination: DEST, amount: "3" })) as {
      data: { preparedId: string };
    };
    const confirmed = (await send("CONFIRM_PAYMENT", { preparedId: prepared.data.preparedId })) as {
      data: { hash: string };
    };
    expect(await send("DISMISS_OUTCOME", { hash: confirmed.data.hash })).toMatchObject({
      ok: true,
    });
    expect(await send("GET_STATUS")).toMatchObject({ data: { inflight: [] } });
  });

  it("LOCK keeps the in-flight record; CANCEL discards a prepared tx", async () => {
    const { h, send } = await setup();
    h.submitTransactionAsync = (xdr) =>
      Promise.resolve({ tx_status: "PENDING" as const, hash: hashOf(xdr) });
    const prepared = (await send("PREPARE_PAYMENT", { destination: DEST, amount: "3" })) as {
      data: { preparedId: string };
    };
    await send("CONFIRM_PAYMENT", { preparedId: prepared.data.preparedId });
    await send("LOCK");
    expect(await send("GET_STATUS")).toMatchObject({
      data: { unlocked: false, inflight: [{ status: "resolving" }] },
    });
  });
});
