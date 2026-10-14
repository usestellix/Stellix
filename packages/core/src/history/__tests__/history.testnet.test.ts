import {
  Account,
  Asset,
  Keypair,
  Memo,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk/base";
import { describe, expect, it } from "vitest";
import { NETWORKS } from "../../network/config.js";
import { fundWithFriendbot } from "../../network/friendbot.js";
import { createHorizonClient } from "../../network/horizon-client.js";
import { isAccountOrigin, normalizeHistory } from "../normalize.js";

// Live testnet history (TESTING §2): real record shapes through getHistoryPage + normalize,
// cursor pagination, memos via join=transactions, and fee attribution on a multi-op tx.
// Fresh keys every run; Friendbot retried up to 3 times.

const fetchFn = { fetch: globalThis.fetch.bind(globalThis) };
const horizon = createHorizonClient(NETWORKS.testnet.horizonUrl, fetchFn);
const OPS = 22;

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

async function included(hash: string): Promise<void> {
  for (let i = 0; i < 30; i++) {
    const tx = await horizon.getTransaction(hash);
    if (tx !== null) {
      expect(tx.successful).toBe(true);
      return;
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error("transaction not included");
}

describe("testnet: history", () => {
  it("pages a multi-op tx by cursor, attributes its fee to the payer only, ends at the origin", async () => {
    const a = Keypair.random();
    const b = Keypair.random();
    await fund(a.publicKey());
    await fund(b.publicKey());
    const loaded = await horizon.getAccount(a.publicKey());
    let builder = new TransactionBuilder(new Account(a.publicKey(), loaded!.sequence), {
      fee: "100",
      networkPassphrase: NETWORKS.testnet.passphrase,
    });
    for (let i = 1; i <= OPS; i++) {
      builder = builder.addOperation(
        Operation.payment({ destination: b.publicKey(), asset: Asset.native(), amount: "1" }),
      );
    }
    const tx = builder.addMemo(Memo.text("paging ✓")).setTimeout(180).build();
    tx.sign(a);
    const submitted = await horizon.submitTransactionAsync(tx.toXdr());
    expect(submitted.tx_status).toBe("PENDING");
    await included(submitted.hash);

    // A (the fee account): 20 + 2 payments, then the Friendbot create_account.
    const page1 = await horizon.getHistoryPage(a.publicKey());
    expect(page1.records).toHaveLength(20);
    expect(page1.nextCursor).not.toBeNull();
    const page2 = await horizon.getHistoryPage(a.publicKey(), page1.nextCursor!);
    expect(page2.nextCursor).toBeNull();
    const items = normalizeHistory([...page1.records, ...page2.records], a.publicKey());
    expect(items).toHaveLength(OPS + 1);
    for (const item of items.slice(0, OPS)) {
      expect(item).toMatchObject({
        direction: "out",
        counterparty: b.publicKey(),
        amountStroops: "10000000",
        memo: { type: "text", value: "paging ✓" },
        fee: { operationCount: OPS },
      });
    }
    expect(new Set(items.slice(0, OPS).map((i) => i.id)).size).toBe(OPS);
    expect(isAccountOrigin(items.at(-1)!)).toBe(true);

    // B sees the same operations as incoming, with the memo and without a fee.
    const received = normalizeHistory(
      (await horizon.getHistoryPage(b.publicKey())).records,
      b.publicKey(),
    );
    expect(received).toHaveLength(20);
    for (const item of received) {
      expect(item).toMatchObject({ direction: "in", counterparty: a.publicKey() });
      expect(item.memo).toEqual({ type: "text", value: "paging ✓" });
      expect(item.fee).toBeUndefined();
    }
  }, 120_000);
});
