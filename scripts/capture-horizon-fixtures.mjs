// Captures real Horizon/Friendbot responses from TESTNET into
// packages/core/src/__fixtures__/horizon/ (TESTING §1: fixtures are captured, never generated;
// they're public data, so nothing is scrubbed).
//
// Creates throwaway testnet accounts via Friendbot, including one with 2 subentries and an extra
// signer (a real multi-subentry, multisig account). Re-run when Horizon changes.
//
// Usage: node scripts/capture-horizon-fixtures.mjs
import {
  Account,
  Asset,
  Keypair,
  Memo,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk/base";
import { mkdirSync, writeFileSync } from "node:fs";

const HORIZON = "https://horizon-testnet.stellar.org";
const FRIENDBOT = "https://friendbot.stellar.org";
const PASSPHRASE = "Test SDF Network ; September 2015";
const OUT = "packages/core/src/__fixtures__/horizon";

/** @param {string} url @param {RequestInit} [init] */
async function get(url, init) {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  const res = await fetch(url, { ...init, headers });
  return { status: res.status, body: /** @type {unknown} */ (await res.json()) };
}

/** @param {string} name @param {{ status: number; body: unknown }} res */
function save(name, res) {
  writeFileSync(`${OUT}/${name}.json`, `${JSON.stringify(res, null, 2)}\n`);
  process.stdout.write(`  ${name}.json (HTTP ${String(res.status)})\n`);
}

mkdirSync(OUT, { recursive: true });

const root = await get(`${HORIZON}/`);
save("root", root);
save("ledgers-latest", await get(`${HORIZON}/ledgers?order=desc&limit=1`));
save("fee-stats", await get(`${HORIZON}/fee_stats`));

// Unfunded: a fresh random key that has never existed.
const unfunded = Keypair.random();
save("account-not-found", await get(`${HORIZON}/accounts/${unfunded.publicKey()}`));

// Funded via Friendbot, then Friendbot again (already funded).
const funded = Keypair.random();
save("friendbot-success", await get(`${FRIENDBOT}/?addr=${funded.publicKey()}`));
save("friendbot-already-funded", await get(`${FRIENDBOT}/?addr=${funded.publicKey()}`));
save("account-funded", await get(`${HORIZON}/accounts/${funded.publicKey()}`));

// Multi-subentry + multisig: one data entry and one extra signer → subentry_count 2.
const multi = Keypair.random();
await get(`${FRIENDBOT}/?addr=${multi.publicKey()}`);
const loaded = /** @type {{ body: { sequence: string } }} */ (
  await get(`${HORIZON}/accounts/${multi.publicKey()}`)
);
const tx = new TransactionBuilder(new Account(multi.publicKey(), loaded.body.sequence), {
  fee: "1000",
  networkPassphrase: PASSPHRASE,
})
  .addOperation(Operation.manageData({ name: "stellix-fixture", value: "1" }))
  .addOperation(
    Operation.setOptions({
      signer: { ed25519PublicKey: Keypair.random().publicKey(), weight: 1 },
    }),
  )
  .setTimeout(60)
  .build();
tx.sign(multi);
const submitted = await get(`${HORIZON}/transactions`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ tx: tx.toXdr() }).toString(),
});
if (submitted.status !== 200)
  throw new Error(`fixture tx failed: ${JSON.stringify(submitted.body)}`);
save("account-multi-subentry", await get(`${HORIZON}/accounts/${multi.publicKey()}`));

// Submission (M3): async PENDING / ERROR, a successful and a failed-in-ledger transaction, and a
// payments page with a memo (join=transactions).
/** @param {Keypair} kp @param {string} seq @param {import("@stellar/stellar-sdk/base").xdr.Operation} op */
function signed(kp, seq, op, memo = Memo.none()) {
  const t = new TransactionBuilder(new Account(kp.publicKey(), seq), {
    fee: "100",
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(op)
    .addMemo(memo)
    .setTimeout(180)
    .build();
  t.sign(kp);
  return t;
}
/** @param {import("@stellar/stellar-sdk/base").Transaction} t */
const submitAsync = (t) =>
  get(`${HORIZON}/transactions_async`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ tx: t.toXdr() }).toString(),
  });
/** @param {string} hash */
async function waitFor(hash) {
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const res = await get(`${HORIZON}/transactions/${hash}`);
    if (res.status === 200) return res;
  }
  throw new Error(`transaction ${hash} not found`);
}
const payer = Keypair.random();
const payee = Keypair.random();
await get(`${FRIENDBOT}/?addr=${payer.publicKey()}`);
await get(`${FRIENDBOT}/?addr=${payee.publicKey()}`);
let seq = /** @type {{ body: { sequence: string } }} */ (
  await get(`${HORIZON}/accounts/${payer.publicKey()}`)
).body.sequence;
const okTx = signed(
  payer,
  seq,
  Operation.payment({ destination: payee.publicKey(), asset: Asset.native(), amount: "1" }),
  Memo.text("fixture"),
);
const pending = await submitAsync(okTx);
save("submit-async-pending", pending);
save("transaction-success", await waitFor(/** @type {{ hash: string }} */ (pending.body).hash));
save(
  "submit-async-bad-seq",
  await submitAsync(
    signed(
      payer,
      seq,
      Operation.payment({ destination: payee.publicKey(), asset: Asset.native(), amount: "1" }),
    ),
  ),
);
seq = /** @type {{ body: { sequence: string } }} */ (
  await get(`${HORIZON}/accounts/${payer.publicKey()}`)
).body.sequence;
const failing = await submitAsync(
  signed(
    payer,
    seq,
    Operation.payment({
      destination: Keypair.random().publicKey(),
      asset: Asset.native(),
      amount: "1",
    }),
  ),
);
save("transaction-failed", await waitFor(/** @type {{ hash: string }} */ (failing.body).hash));
save("transaction-not-found", await get(`${HORIZON}/transactions/${"0".repeat(64)}`));
save(
  "payments-page",
  await get(
    `${HORIZON}/accounts/${payer.publicKey()}/payments?order=desc&limit=200&join=transactions`,
  ),
);

// History (M4): one account with every record type the normalizer handles.
const me = Keypair.random();
const peer = Keypair.random();
const merging = Keypair.random();
await get(`${FRIENDBOT}/?addr=${me.publicKey()}`);
await get(`${FRIENDBOT}/?addr=${peer.publicKey()}`);
await get(`${FRIENDBOT}/?addr=${merging.publicKey()}`);
/** @param {Keypair} kp */
const seqOf = async (kp) =>
  /** @type {{ body: { sequence: string } }} */ (await get(`${HORIZON}/accounts/${kp.publicKey()}`))
    .body.sequence;
const { MuxedAccount } = await import("@stellar/stellar-sdk/base");
const peerMuxed = new MuxedAccount(new Account(peer.publicKey(), "0"), "424242").accountId();
const created = Keypair.random();
const historyTx = new TransactionBuilder(new Account(me.publicKey(), await seqOf(me)), {
  fee: "1000",
  networkPassphrase: PASSPHRASE,
})
  .addOperation(
    Operation.payment({ destination: peer.publicKey(), asset: Asset.native(), amount: "3" }),
  )
  .addOperation(
    Operation.payment({ destination: peerMuxed, asset: Asset.native(), amount: "1.25" }),
  )
  .addOperation(Operation.createAccount({ destination: created.publicKey(), startingBalance: "2" }))
  .addOperation(
    Operation.pathPaymentStrictSend({
      sendAsset: Asset.native(),
      sendAmount: "0.5",
      destination: peer.publicKey(),
      destAsset: Asset.native(),
      destMin: "0.5",
      path: [],
    }),
  )
  .addMemo(Memo.text("history fixture"))
  .setTimeout(180)
  .build();
historyTx.sign(me);
await waitFor(/** @type {{ hash: string }} */ ((await submitAsync(historyTx)).body).hash);
const incoming = signed(
  peer,
  await seqOf(peer),
  Operation.payment({ destination: me.publicKey(), asset: Asset.native(), amount: "7.5" }),
  Memo.id("9001"),
);
await waitFor(/** @type {{ hash: string }} */ ((await submitAsync(incoming)).body).hash);
const merge = signed(
  merging,
  await seqOf(merging),
  Operation.accountMerge({ destination: me.publicKey() }),
);
await waitFor(/** @type {{ hash: string }} */ ((await submitAsync(merge)).body).hash);
const history = await get(
  `${HORIZON}/accounts/${me.publicKey()}/payments?order=desc&limit=20&include_failed=false&join=transactions`,
);
save("history-page", history);
save("history-me", {
  status: 200,
  body: {
    id: me.publicKey(),
    peer: peer.publicKey(),
    peerMuxed,
    created: created.publicKey(),
    merged: merging.publicKey(),
  },
});
const mergeRecord = /** @type {{ _embedded: { records: { id: string; type: string }[] } }} */ (
  history.body
)._embedded.records.find((r) => r.type === "account_merge");
if (mergeRecord === undefined) throw new Error("no account_merge record");
save("effects-account-merge", await get(`${HORIZON}/operations/${mergeRecord.id}/effects`));

// 25 payments in one transaction (fee_account = me): fee attribution on multi-op transactions
// and cursor pagination (page 1 = 20 records, page 2 via _links.next).
let batch = new TransactionBuilder(new Account(me.publicKey(), await seqOf(me)), {
  fee: "100",
  networkPassphrase: PASSPHRASE,
});
for (let i = 1; i <= 25; i++) {
  batch = batch.addOperation(
    Operation.payment({ destination: peer.publicKey(), asset: Asset.native(), amount: String(i) }),
  );
}
const batchTx = batch.setTimeout(180).build();
batchTx.sign(me);
await waitFor(/** @type {{ hash: string }} */ ((await submitAsync(batchTx)).body).hash);
const page1 = await get(
  `${HORIZON}/accounts/${me.publicKey()}/payments?order=desc&limit=20&include_failed=false&join=transactions`,
);
save("history-multiop-page1", page1);
const next = /** @type {{ _links: { next: { href: string } } }} */ (page1.body)._links.next.href;
save("history-multiop-page2", await get(next));

const meta = /** @type {{ horizon_version: string; current_protocol_version: number }} */ (
  root.body
);
writeFileSync(
  `${OUT}/_meta.json`,
  `${JSON.stringify({ capturedAt: new Date().toISOString(), network: "testnet", horizonVersion: meta.horizon_version, protocolVersion: meta.current_protocol_version }, null, 2)}\n`,
);
process.stdout.write("Done.\n");
