import {
  Account,
  Keypair,
  MuxedAccount,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk/base";
import { describe, expect, it } from "vitest";
import { generateMnemonic } from "../../keys/mnemonic.js";
import { NETWORKS } from "../../network/config.js";
import { fundWithFriendbot } from "../../network/friendbot.js";
import { createHorizonClient } from "../../network/horizon-client.js";
import { MemoryKeyValueStore } from "../../testing/memory-key-value-store.js";
import { importWallet } from "../onboarding.js";
import { confirmPayment, preparePayment, type SubmitOutcome } from "../send.js";
import { DEFAULT_SCRYPT_PARAMS } from "../../vault/kdf.js";

// TESTING §2 scenarios 1–6 against live testnet, through the real send service.
// Fresh keys every run; Friendbot retried up to 3 times.

const fetchFn = { fetch: globalThis.fetch.bind(globalThis) };
const horizon = createHorizonClient(NETWORKS.testnet.horizonUrl, fetchFn);
const H = NETWORKS.testnet.horizonUrl;
const deps = { horizonFor: () => horizon };

async function fund(address: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await fundWithFriendbot("testnet", address, horizon, fetchFn);
      return;
    } catch (err: unknown) {
      if (attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 2_000));
    }
  }
}

/** A freshly imported, Friendbot-funded wallet with real time. */
async function wallet() {
  const platform = {
    persistent: new MemoryKeyValueStore(),
    session: new MemoryKeyValueStore(),
    now: () => Date.now(),
    fetch: fetchFn.fetch,
  };
  const { accounts } = await importWallet(
    platform,
    { mnemonic: generateMnemonic(), password: "correct horse battery" },
    {
      scryptParams: { ...DEFAULT_SCRYPT_PARAMS, N: 2 ** 15 },
    },
  );
  const source = accounts[0]!.publicKey;
  await fund(source);
  return { platform, source };
}

async function send(
  platform: Awaited<ReturnType<typeof wallet>>["platform"],
  input: Parameters<typeof preparePayment>[2],
): Promise<SubmitOutcome> {
  const { preparedId } = await preparePayment(platform, deps, input);
  return confirmPayment(platform, deps, preparedId, 60_000);
}

const nativeBalance = async (id: string) =>
  (await horizon.getAccount(id))?.balances.find((b) => b.asset_type === "native") as
    { balance: string } | undefined;

describe("testnet: send (TESTING §2)", () => {
  it("1. createAccount from A to a new B with 1 XLM", async () => {
    const { platform } = await wallet();
    const b = Keypair.random().publicKey();
    expect(await send(platform, { destination: b, amount: "1" })).toMatchObject({
      status: "success",
    });
    expect((await nativeBalance(b))?.balance).toBe("1.0000000");
  });

  it("2. payment with a text memo; B's history shows it via join=transactions", async () => {
    const { platform } = await wallet();
    const b = Keypair.random().publicKey();
    await fund(b);
    const outcome = await send(platform, {
      destination: b,
      amount: "2",
      memo: { type: "text", value: "invoice 42 ✓" },
    });
    expect(outcome).toMatchObject({ status: "success" });
    const res = await fetch(`${H}/accounts/${b}/payments?order=desc&limit=5&join=transactions`);
    const page = (await res.json()) as {
      _embedded: { records: { transaction: { memo?: string; memo_type: string } }[] };
    };
    expect(page._embedded.records[0]?.transaction).toMatchObject({
      memo_type: "text",
      memo: "invoice 42 ✓",
    });
  });

  it("3. payment to B's M address: the record carries to_muxed_id", async () => {
    const { platform } = await wallet();
    const b = Keypair.random().publicKey();
    await fund(b);
    const m = new MuxedAccount(new Account(b, "0"), "1234567").accountId();
    expect(await send(platform, { destination: m, amount: "1" })).toMatchObject({
      status: "success",
    });
    const res = await fetch(`${H}/accounts/${b}/payments?order=desc&limit=5`);
    const page = (await res.json()) as { _embedded: { records: { to_muxed_id?: string }[] } };
    expect(page._embedded.records[0]?.to_muxed_id).toBe("1234567");
  });

  it("4. SEP-29: after B sets config.memo_required, sending without a memo → MEMO_REQUIRED", async () => {
    const { platform } = await wallet();
    const b = Keypair.random();
    await fund(b.publicKey());
    const loaded = (await horizon.getAccount(b.publicKey()))!;
    const tx = new TransactionBuilder(new Account(b.publicKey(), loaded.sequence), {
      fee: "1000",
      networkPassphrase: NETWORKS.testnet.passphrase,
    })
      .addOperation(Operation.manageData({ name: "config.memo_required", value: "1" }))
      .setTimeout(60)
      .build();
    tx.sign(b);
    const sub = await horizon.submitTransactionAsync(tx.toXdr());
    expect(sub.tx_status).toBe("PENDING");
    for (
      let i = 0;
      i < 20 &&
      (await horizon.getAccount(b.publicKey()))?.data["config.memo_required"] === undefined;
      i++
    ) {
      await new Promise((r) => setTimeout(r, 2_000));
    }
    await expect(
      preparePayment(platform, deps, { destination: b.publicKey(), amount: "1" }),
    ).rejects.toMatchObject({ code: "MEMO_REQUIRED" });
    expect(
      await send(platform, {
        destination: b.publicKey(),
        amount: "1",
        memo: { type: "id", value: "99" },
      }),
    ).toMatchObject({ status: "success" });
  });

  it("5. two txs built from the same sequence: the second is rejected tx_bad_seq → rebuild", async () => {
    const { platform } = await wallet();
    const b = Keypair.random().publicKey();
    await fund(b);
    const first = await preparePayment(platform, deps, { destination: b, amount: "1" });
    const second = await preparePayment(platform, deps, { destination: b, amount: "1" });
    expect(await confirmPayment(platform, deps, first.preparedId, 60_000)).toMatchObject({
      status: "success",
    });
    expect(await confirmPayment(platform, deps, second.preparedId, 60_000)).toEqual({
      status: "rebuild",
      reason: "bad_seq",
    });
  });

  it("6. send max: remaining balance equals the minimum balance", async () => {
    const { platform, source } = await wallet();
    const b = Keypair.random().publicKey();
    await fund(b);
    const tooMuch = await preparePayment(platform, deps, {
      destination: b,
      amount: "100000",
    }).catch((e: unknown) => e);
    const max = (tooMuch as { details?: { maxSendableStroops?: string } }).details
      ?.maxSendableStroops;
    expect(max).toMatch(/^\d+$/);
    const whole = BigInt(max!);
    const amount = `${(whole / 10_000_000n).toString()}.${(whole % 10_000_000n).toString().padStart(7, "0")}`;
    const { preparedId, summary } = await preparePayment(platform, deps, {
      destination: b,
      amount,
    });
    expect(await confirmPayment(platform, deps, preparedId, 60_000)).toMatchObject({
      status: "success",
    });
    const reserve = BigInt((await horizon.getLatestLedger()).base_reserve_in_stroops);
    // Charged fee may be lower than the bid; the remainder is the minimum balance plus that refund.
    const remaining = (await nativeBalance(source))!.balance;
    const remainingStroops = BigInt(remaining.replace(".", ""));
    expect(remainingStroops).toBeGreaterThanOrEqual(2n * reserve);
    expect(remainingStroops).toBeLessThanOrEqual(2n * reserve + BigInt(summary.feeStroops));
  });
});
