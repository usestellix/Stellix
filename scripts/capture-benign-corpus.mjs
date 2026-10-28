// Captures ordinary classic transactions from TESTNET for Shield's benign corpus (TESTING §1,
// SHIELD §10.3). The JSON files contain public signed envelopes and public Horizon responses only.
//
// Usage: node scripts/capture-benign-corpus.mjs
import { Asset, Claimant, Keypair, Memo, Operation } from "@stellar/stellar-sdk/base";
import { mkdirSync } from "node:fs";
import {
  HORIZON,
  PASSPHRASE,
  fund,
  get,
  submit,
  txFrom,
  writeJson,
} from "./lib/shield-capture.mjs";

const OUT = "packages/core/src/security/__corpus__/benign";
mkdirSync(OUT, { recursive: true });

/**
 * @param {string} id
 * @param {string} description
 * @param {import("@stellar/stellar-sdk/base").Transaction} tx
 * @param {import("@stellar/stellar-sdk/base").Keypair} user
 * @param {string[]} presentedDestinations
 * @param {Record<string, string>} lookupPaths
 * @param {string[]} expectedFindings
 */
async function capture(
  id,
  description,
  tx,
  user,
  presentedDestinations = [],
  lookupPaths = {},
  expectedFindings = [],
) {
  const lookups = {};
  for (const [key, path] of Object.entries(lookupPaths)) {
    const response = await get(`${HORIZON}/${path}`);
    lookups[key] = { path, status: response.status, body: response.body };
  }
  const record = await submit(tx, [user]);
  await writeJson(`${OUT}/${id}.json`, {
    id,
    description,
    networkPassphrase: PASSPHRASE,
    capturedAt: new Date().toISOString(),
    userAccount: user.publicKey(),
    presentedDestinations,
    envelopeXdr: tx.toXdr(),
    expectedFindings,
    lookups,
    hash: Buffer.from(tx.hash()).toString("hex"),
    transaction: record,
  });
  process.stdout.write(`  benign/${id}.json\n`);
}

const user = Keypair.random();
const peer = Keypair.random();
const issuer = Keypair.random();
const maker = Keypair.random();
process.stdout.write("Funding benign corpus accounts via Friendbot…\n");
for (const account of [user, peer, issuer, maker]) await fund(account);

const native = Asset.native();
const asset = new Asset("BEN", issuer.publicKey());

await capture(
  "payment-native",
  "User sends 1 XLM to an existing testnet account with a short memo.",
  await txFrom(
    user,
    [Operation.payment({ destination: peer.publicKey(), asset: native, amount: "1" })],
    { memo: Memo.text("benign corpus") },
  ),
  user,
  [peer.publicKey()],
);

await capture(
  "trustline-unverified-issuer",
  "User adds a trustline to a testnet asset issued by an account without a home domain.",
  await txFrom(user, [Operation.changeTrust({ asset })]),
  user,
  [],
  { issuer: `accounts/${issuer.publicKey()}` },
  ["TRUST_UNVERIFIED"],
);

await submit(await txFrom(maker, [Operation.changeTrust({ asset })]), [maker]);
await submit(
  await txFrom(issuer, [
    Operation.payment({ destination: maker.publicKey(), asset, amount: "1000" }),
  ]),
  [issuer],
);
await submit(
  await txFrom(maker, [
    Operation.manageSellOffer({
      selling: asset,
      buying: native,
      amount: "100",
      price: { n: 1, d: 2 },
    }),
  ]),
  [maker],
);
await submit(await txFrom(user, [Operation.changeTrust({ asset })]), [user]);

const orderBookPath =
  "order_book?selling_asset_type=native&buying_asset_type=credit_alphanum4" +
  `&buying_asset_code=BEN&buying_asset_issuer=${encodeURIComponent(issuer.publicKey())}&limit=1`;
const marketOffer = await txFrom(user, [
  Operation.manageSellOffer({
    selling: native,
    buying: asset,
    amount: "1",
    price: { n: 2, d: 1 },
  }),
]);
await capture(
  "offer-at-market",
  "User places a sell offer at the best opposing testnet order-book price.",
  marketOffer,
  user,
  [],
  { orderBook: orderBookPath },
);

const createClaimable = await txFrom(user, [
  Operation.createClaimableBalance({
    asset: native,
    amount: "1",
    claimants: [new Claimant(user.publicKey(), Claimant.predicateUnconditional())],
  }),
]);
const balanceId = createClaimable.getClaimableBalanceId(0);
await capture(
  "claimable-create-self",
  "User creates a one-XLM claimable balance for their own account.",
  createClaimable,
  user,
);

await capture(
  "claimable-claim-self",
  "User claims the one-XLM claimable balance created for their account.",
  await txFrom(user, [Operation.claimClaimableBalance({ balanceId })]),
  user,
);

process.stdout.write("Benign Shield corpus captured from testnet.\n");
