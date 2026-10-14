// Captures real Horizon/Friendbot responses from TESTNET into
// packages/core/src/__fixtures__/horizon/ (TESTING §1: fixtures are captured, never generated;
// they're public data, so nothing is scrubbed).
//
// Creates throwaway testnet accounts via Friendbot, including one with 2 subentries and an extra
// signer (a real multi-subentry, multisig account). Re-run when Horizon changes.
//
// Usage: node scripts/capture-horizon-fixtures.mjs
import { Account, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk/base";
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

const meta = /** @type {{ horizon_version: string; current_protocol_version: number }} */ (
  root.body
);
writeFileSync(
  `${OUT}/_meta.json`,
  `${JSON.stringify({ capturedAt: new Date().toISOString(), network: "testnet", horizonVersion: meta.horizon_version, protocolVersion: meta.current_protocol_version }, null, 2)}\n`,
);
process.stdout.write("Done.\n");
