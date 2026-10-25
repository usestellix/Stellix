// Captures Shield fixtures that capture-shield-fixtures.mjs doesn't, from TESTNET (TESTING §1:
// captured, never generated). Additive: it rewrites only its own files and merges its entries
// into the ops `_index.json`, so the main capture's fixtures (and the test constants built on
// their accounts) stay as they are. After re-running the main script, re-run this one.
//
// Usage: node scripts/capture-shield-extra-fixtures.mjs <group>…
//   preconditions   a transaction without preconditions (PRECOND_NONE)
//   offers          order books + offers at a known distance from the best bid (OFFER_BAD_PRICE)
//   paths           path-finding results + path payments with known loss bounds (PATH_LOW_MIN)
//   trust           issuer accounts + their stellar.toml + changeTrust (TRUST_UNVERIFIED, _CLAWBACK)
//   memo            a SEP-29 memo-required account + payments, path payments and a merge to it (MEMO_REQUIRED)
//
// Market fixtures (`__fixtures__/market/<name>.json`) pair the Horizon responses a rule's gather
// step reads with the user's transaction, both captured on testnet: the lookups first (what
// analysis would see before signing), then the transaction is submitted.
import {
  Account,
  Asset,
  Keypair,
  Memo,
  MuxedAccount,
  Operation,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk/base";
import { mkdirSync, readFileSync } from "node:fs";
import {
  HORIZON,
  OPS_DIR,
  PASSPHRASE,
  captureOpFixture,
  fund,
  get,
  sleep,
  submit,
  txFrom,
  writeJson,
} from "./lib/shield-capture.mjs";

const MARKET_DIR = "packages/core/src/security/__fixtures__/market";
const GROUPS = ["preconditions", "offers", "paths", "trust", "memo"];
const groups = process.argv.slice(2);
if (groups.length === 0 || groups.some((g) => !GROUPS.includes(g))) {
  throw new Error(`usage: capture-shield-extra-fixtures.mjs <${GROUPS.join("|")}>…`);
}

/** @param {string} path @returns {unknown} */
function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/** @type {Record<string, { opType: string; opTypes: string[]; envelopeType: string }>} */
const added = {};

if (groups.includes("preconditions")) {
  const user = Keypair.random();
  const peer = Keypair.random();
  process.stdout.write("Funding accounts via Friendbot…\n");
  for (const kp of [user, peer]) await fund(kp);

  // The SDK's builder always writes time bounds, so the transaction is rebuilt from its XDR with
  // PRECOND_NONE. The network accepts it; that's what the capture proves.
  const built = await txFrom(user, [
    Operation.payment({ destination: peer.publicKey(), asset: Asset.native(), amount: "1" }),
  ]);
  const parsed = xdr.TransactionEnvelope.fromXdr(built.toXdr(), "base64");
  if (parsed.type !== "envelopeTypeTx") throw new Error("expected a v1 envelope");
  const t = parsed.v1.tx;
  const tx = new xdr.Transaction({
    sourceAccount: t.sourceAccount,
    fee: t.fee,
    seqNum: t.seqNum,
    cond: xdr.Preconditions.precondNone(),
    memo: t.memo,
    operations: t.operations,
    ext: t.ext,
  });
  const envelope = xdr.TransactionEnvelope.envelopeTypeTx(
    new xdr.TransactionV1Envelope({ tx, signatures: [] }),
  );
  const unsigned = TransactionBuilder.fromXdr(envelope.toXdr("base64"), PASSPHRASE);
  if (!("operations" in unsigned)) throw new Error("expected a transaction, not a fee bump");
  const { entry } = await captureOpFixture(
    "preconditions-none",
    "preconditions",
    "Payment with no preconditions at all (PRECOND_NONE): no time bounds.",
    unsigned,
    [user],
  );
  added["preconditions-none"] = entry;
}

/**
 * Horizon asset query parameters, as HorizonClient writes them (`selling_` / `buying_` prefix).
 * @param {string} prefix @param {Asset} asset
 */
function assetParams(prefix, asset) {
  if (asset.isNative()) return `${prefix}asset_type=native`;
  const type = asset.getCode().length <= 4 ? "credit_alphanum4" : "credit_alphanum12";
  const issuer = asset.getIssuer();
  if (issuer === undefined) throw new Error("credit asset without issuer");
  return `${prefix}asset_type=${type}&${prefix}asset_code=${asset.getCode()}&${prefix}asset_issuer=${issuer}`;
}

/** The order-book path HorizonClient.getOrderBook requests. @param {Asset} selling @param {Asset} buying */
function orderBookPath(selling, buying) {
  return `order_book?${assetParams("selling_", selling)}&${assetParams("buying_", buying)}&limit=1`;
}

/** One entry of a Horizon asset list (`source_assets`, `destination_assets`). @param {Asset} asset */
function assetListItem(asset) {
  return asset.isNative() ? "native" : `${asset.getCode()}:${String(asset.getIssuer())}`;
}

/** As HorizonClient.getStrictSendPaths requests it. @param {Asset} send @param {string} amount @param {Asset} dest */
function strictSendPath(send, amount, dest) {
  return `paths/strict-send?${assetParams("source_", send)}&source_amount=${amount}&destination_assets=${encodeURIComponent(assetListItem(dest))}`;
}

/** As HorizonClient.getStrictReceivePaths requests it. @param {Asset} send @param {Asset} dest @param {string} amount */
function strictReceivePath(send, dest, amount) {
  return `paths/strict-receive?source_assets=${encodeURIComponent(assetListItem(send))}&${assetParams("destination_", dest)}&destination_amount=${amount}`;
}

/**
 * A Horizon path (relative to its root, JSON body), or an issuer's stellar.toml (absolute https
 * URL, kept as text with the headers the fetcher checks).
 * @param {string} path
 */
async function lookup(path) {
  if (path.startsWith("https://")) {
    const res = await fetch(path, { redirect: "manual" });
    return {
      path,
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type"),
        location: res.headers.get("location"),
      },
      text: await res.text(),
    };
  }
  const res = await get(`${HORIZON}/${path}`);
  return { path, status: res.status, body: res.body };
}

/**
 * Captures `lookups` (Horizon paths), then submits `tx`, and writes `<MARKET_DIR>/<name>.json`.
 * @param {string} name @param {string} description
 * @param {Record<string, string>} lookups key → Horizon path
 * @param {import("@stellar/stellar-sdk/base").Transaction} tx
 * @param {import("@stellar/stellar-sdk/base").Keypair} user signer and the wallet user
 */
async function captureMarket(name, description, lookups, tx, user) {
  /** @type {Record<string, unknown>} */
  const responses = {};
  for (const [key, path] of Object.entries(lookups)) responses[key] = await lookup(path);
  const record = await submit(tx, [user]);
  await writeJson(`${MARKET_DIR}/${name}.json`, {
    name,
    description,
    networkPassphrase: PASSPHRASE,
    capturedAt: new Date().toISOString(),
    userAccount: user.publicKey(),
    lookups: responses,
    hash: Buffer.from(tx.hash()).toString("hex"),
    envelopeXdr: tx.toXdr(),
    transaction: record,
  });
  process.stdout.write(`  market/${name}.json\n`);
}

/**
 * Captures `lookups` only, for a case whose transaction couldn't succeed on chain.
 * @param {string} name @param {string} description @param {Record<string, string>} lookups
 */
async function captureLookups(name, description, lookups) {
  /** @type {Record<string, unknown>} */
  const responses = {};
  for (const [key, path] of Object.entries(lookups)) responses[key] = await lookup(path);
  await writeJson(`${MARKET_DIR}/${name}.json`, {
    name,
    description,
    networkPassphrase: PASSPHRASE,
    capturedAt: new Date().toISOString(),
    lookups: responses,
  });
  process.stdout.write(`  market/${name}.json (lookups only)\n`);
}

if (groups.includes("offers")) {
  mkdirSync(MARKET_DIR, { recursive: true });
  const issuer = Keypair.random();
  const maker = Keypair.random();
  const user = Keypair.random();
  process.stdout.write("Funding accounts via Friendbot…\n");
  for (const kp of [issuer, maker, user]) await fund(kp);
  const MKT = new Asset("MKT", issuer.publicKey());
  const XLM = Asset.native();

  await submit(await txFrom(maker, [Operation.changeTrust({ asset: MKT })]), [maker]);
  await submit(await txFrom(user, [Operation.changeTrust({ asset: MKT })]), [user]);
  await submit(
    await txFrom(issuer, [
      Operation.payment({ destination: maker.publicKey(), asset: MKT, amount: "1000000" }),
    ]),
    [issuer],
  );
  // The maker sells MKT for XLM. In the XLM→MKT book these are bids, priced in MKT per XLM:
  // 1/2 XLM per MKT is a bid of 2 MKT/XLM (the best), 2/3 XLM per MKT a worse bid of 1.5.
  await submit(
    await txFrom(maker, [
      Operation.manageSellOffer({
        selling: MKT,
        buying: XLM,
        amount: "100000",
        price: { n: 1, d: 2 },
      }),
      Operation.manageSellOffer({
        selling: MKT,
        buying: XLM,
        amount: "100000",
        price: { n: 2, d: 3 },
      }),
    ]),
    [maker],
  );

  const book = { orderBook: orderBookPath(XLM, MKT) };
  // Best bid 2 MKT/XLM. 1.8 (9/5) is 10% (1000 bps) below it; 1.98 (99/50) is 1% (100 bps).
  // A buy offer's price is the inverse (XLM per MKT): 5/9 and 50/99.
  const cases = [
    [
      "offer-sell-10pct-below",
      "manageSellOffer: 10 XLM for MKT at 1.8 MKT/XLM, 10% below the best bid (2).",
      Operation.manageSellOffer({ selling: XLM, buying: MKT, amount: "10", price: { n: 9, d: 5 } }),
    ],
    [
      "offer-sell-1pct-below",
      "manageSellOffer: 10 XLM for MKT at 1.98 MKT/XLM, 1% below the best bid (2).",
      Operation.manageSellOffer({
        selling: XLM,
        buying: MKT,
        amount: "10",
        price: { n: 99, d: 50 },
      }),
    ],
    [
      "offer-buy-10pct-below",
      "manageBuyOffer: buy 10 MKT with XLM at 5/9 XLM/MKT (sells XLM at 1.8 MKT/XLM, 10% below the best bid).",
      Operation.manageBuyOffer({
        selling: XLM,
        buying: MKT,
        buyAmount: "10",
        price: { n: 5, d: 9 },
      }),
    ],
    [
      "offer-buy-1pct-below",
      "manageBuyOffer: buy 10 MKT with XLM at 50/99 XLM/MKT (sells XLM at 1.98 MKT/XLM, 1% below the best bid).",
      Operation.manageBuyOffer({
        selling: XLM,
        buying: MKT,
        buyAmount: "10",
        price: { n: 50, d: 99 },
      }),
    ],
    [
      "offer-passive-10pct-below",
      "createPassiveSellOffer: 10 XLM for MKT at 1.8 MKT/XLM, 10% below the best bid (2).",
      Operation.createPassiveSellOffer({
        selling: XLM,
        buying: MKT,
        amount: "10",
        price: { n: 9, d: 5 },
      }),
    ],
    [
      "offer-passive-1pct-below",
      "createPassiveSellOffer: 10 XLM for MKT at 1.98 MKT/XLM, 1% below the best bid (2).",
      Operation.createPassiveSellOffer({
        selling: XLM,
        buying: MKT,
        amount: "10",
        price: { n: 99, d: 50 },
      }),
    ],
  ];
  for (const [
    name,
    description,
    op,
  ] of /** @type {[string, string, import("@stellar/stellar-sdk/base").xdr.Operation][]} */ (
    cases
  )) {
    await captureMarket(name, description, book, await txFrom(user, [op]), user);
  }

  // A pair nobody trades: the opposing side is empty, so there is no reference price.
  const EMPTY = new Asset("NOBK", issuer.publicKey());
  await submit(await txFrom(user, [Operation.changeTrust({ asset: EMPTY })]), [user]);
  await captureMarket(
    "offer-empty-book",
    "manageSellOffer: 10 XLM for NOBK, a pair with no offers (no reference price).",
    { orderBook: orderBookPath(XLM, EMPTY) },
    await txFrom(user, [
      Operation.manageSellOffer({
        selling: XLM,
        buying: EMPTY,
        amount: "10",
        price: { n: 1, d: 1 },
      }),
    ]),
    user,
  );
}

if (groups.includes("paths")) {
  mkdirSync(MARKET_DIR, { recursive: true });
  const issuer = Keypair.random();
  const maker = Keypair.random();
  const user = Keypair.random();
  const peer = Keypair.random();
  process.stdout.write("Funding accounts via Friendbot…\n");
  for (const kp of [issuer, maker, user, peer]) await fund(kp);
  const MKT = new Asset("MKT", issuer.publicKey());
  const XLM = Asset.native();

  for (const kp of [maker, user, peer]) {
    await submit(await txFrom(kp, [Operation.changeTrust({ asset: MKT })]), [kp]);
  }
  await submit(
    await txFrom(issuer, [
      Operation.payment({ destination: maker.publicKey(), asset: MKT, amount: "1000000" }),
    ]),
    [issuer],
  );
  // The maker sells MKT at 1/2 XLM per MKT: XLM → MKT converts at 2 MKT per XLM, so the best
  // path for 10 XLM delivers 20 MKT, and the best path to deliver 10 MKT costs 5 XLM.
  await submit(
    await txFrom(maker, [
      Operation.manageSellOffer({
        selling: MKT,
        buying: XLM,
        amount: "100000",
        price: { n: 1, d: 2 },
      }),
    ]),
    [maker],
  );

  // Horizon's path finding reads an in-memory order-book graph that catches up a ledger or so
  // after ingestion; wait until it sees the maker's offer before capturing anything.
  for (let i = 0; ; i++) {
    const warm = await lookup(strictSendPath(XLM, "10.0000000", MKT));
    const records = /** @type {{ _embedded?: { records: unknown[] } }} */ (warm.body)._embedded;
    if ((records?.records.length ?? 0) > 0) break;
    if (i >= 15) throw new Error("path finding never saw the maker's offer");
    await sleep(2000);
  }

  const send = { paths: strictSendPath(XLM, "10.0000000", MKT) };
  const receive = { paths: strictReceivePath(XLM, MKT, "10.0000000") };
  const dest = peer.publicKey();
  const cases = [
    [
      "path-send-near-zero-min",
      "pathPaymentStrictSend: 10 XLM → MKT with destMin 0.0000001; the best path delivers 20 MKT.",
      send,
      Operation.pathPaymentStrictSend({
        sendAsset: XLM,
        sendAmount: "10",
        destination: dest,
        destAsset: MKT,
        destMin: "0.0000001",
        path: [],
      }),
    ],
    [
      "path-send-1pct-min",
      "pathPaymentStrictSend: 10 XLM → MKT with destMin 19.8 (1% below the best path's 20 MKT).",
      send,
      Operation.pathPaymentStrictSend({
        sendAsset: XLM,
        sendAmount: "10",
        destination: dest,
        destAsset: MKT,
        destMin: "19.8",
        path: [],
      }),
    ],
    [
      "path-receive-10pct-max",
      "pathPaymentStrictReceive: deliver 10 MKT for sendMax 5.5 XLM (10% above the best path's 5 XLM).",
      receive,
      Operation.pathPaymentStrictReceive({
        sendAsset: XLM,
        sendMax: "5.5",
        destination: dest,
        destAsset: MKT,
        destAmount: "10",
        path: [],
      }),
    ],
    [
      "path-receive-1pct-max",
      "pathPaymentStrictReceive: deliver 10 MKT for sendMax 5.05 XLM (1% above the best path's 5 XLM).",
      receive,
      Operation.pathPaymentStrictReceive({
        sendAsset: XLM,
        sendMax: "5.05",
        destination: dest,
        destAsset: MKT,
        destAmount: "10",
        path: [],
      }),
    ],
  ];
  for (const [
    name,
    description,
    lookups,
    op,
  ] of /** @type {[string, string, Record<string, string>, import("@stellar/stellar-sdk/base").xdr.Operation][]} */ (
    cases
  )) {
    await captureMarket(name, description, lookups, await txFrom(user, [op]), user);
  }

  // No market for NOPATH: path finding finds no route. A path payment over it would fail on
  // chain, so this fixture is the captured lookup alone, without a transaction.
  const NOPATH = new Asset("NOPATH", issuer.publicKey());
  await captureLookups(
    "path-no-route",
    "Path finding for 10 XLM → NOPATH, an asset with no market: no records.",
    { paths: strictSendPath(XLM, "10.0000000", NOPATH) },
  );
}

if (groups.includes("trust")) {
  mkdirSync(MARKET_DIR, { recursive: true });
  const user = Keypair.random();
  const impostor = Keypair.random(); // claims a real issuer's home domain for the same code
  const plain = Keypair.random(); // no home domain
  process.stdout.write("Funding accounts via Friendbot…\n");
  for (const kp of [user, impostor, plain]) await fund(kp);

  // Third-party testnet issuers, found through Horizon's /assets toml links on 2026-10-25:
  // nyala's staging SRT is listed in its toml and has auth_clawback_enabled; wetheunion.com's
  // EURC issuer points at a parked domain that serves an HTML page instead of a toml.
  const NYALA = "4344.staging.register.nyala.de";
  const SRT = new Asset("SRT", "GCXWSVROJKVC7R5QODVRA3C4MLN4USLBQKK5H4GLJQ7KS7KTBREZQ7NN");
  const EURC = new Asset("EURC", "GA5NJ3H2BQG2Y7SGCHLMSQS3VFDJ236NRUTVF3HQDPKCQED6IN7GYLZK");
  const FAKE_SRT = new Asset("SRT", impostor.publicKey());
  const PLAIN = new Asset("PLAIN", plain.publicKey());
  await submit(await txFrom(impostor, [Operation.setOptions({ homeDomain: NYALA })]), [impostor]);

  /** @param {Asset} asset @param {string | null} homeDomain */
  const trustLookups = (asset, homeDomain) => ({
    issuer: `accounts/${String(asset.getIssuer())}`,
    ...(homeDomain === null ? {} : { toml: `https://${homeDomain}/.well-known/stellar.toml` }),
  });
  const cases = [
    [
      "trust-listed-clawback",
      "changeTrust to SRT from an issuer whose stellar.toml lists it, with auth_clawback_enabled.",
      SRT,
      NYALA,
    ],
    [
      "trust-parked-domain",
      "changeTrust to EURC from an issuer whose home domain serves an HTML page, not a toml.",
      EURC,
      "wetheunion.com",
    ],
    [
      "trust-unlisted",
      "changeTrust to SRT from an issuer claiming nyala's home domain; its toml lists SRT under another issuer.",
      FAKE_SRT,
      NYALA,
    ],
    [
      "trust-no-home-domain",
      "changeTrust to an asset whose issuer has no home domain.",
      PLAIN,
      null,
    ],
  ];
  for (const [
    name,
    description,
    asset,
    homeDomain,
  ] of /** @type {[string, string, Asset, string | null][]} */ (cases)) {
    await captureMarket(
      name,
      description,
      trustLookups(asset, homeDomain),
      await txFrom(user, [Operation.changeTrust({ asset })]),
      user,
    );
  }
}

if (groups.includes("memo")) {
  mkdirSync(MARKET_DIR, { recursive: true });
  const user = Keypair.random();
  const required = Keypair.random(); // sets config.memo_required (SEP-29)
  const plain = Keypair.random(); // no data entries
  const merged = Keypair.random(); // the user of the accountMerge case
  process.stdout.write("Funding accounts via Friendbot…\n");
  for (const kp of [user, required, plain, merged]) await fund(kp);
  await submit(
    await txFrom(required, [Operation.manageData({ name: "config.memo_required", value: "1" })]),
    [required],
  );

  const XLM = Asset.native();
  const pay = (/** @type {string} */ destination) =>
    Operation.payment({ destination, asset: XLM, amount: "1" });
  const destinationLookup = (/** @type {Keypair} */ kp) => ({
    destination: `accounts/${kp.publicKey()}`,
  });
  const requiredMuxed = new MuxedAccount(new Account(required.publicKey(), "0"), "42").accountId();
  /** @type {[string, string, Record<string, string>, () => Promise<import("@stellar/stellar-sdk/base").Transaction>, Keypair][]} */
  const cases = [
    [
      "memo-payment-none",
      "payment to an account with config.memo_required = 1, no memo.",
      destinationLookup(required),
      () => txFrom(user, [pay(required.publicKey())]),
      user,
    ],
    [
      "memo-payment-text",
      "payment to an account with config.memo_required = 1, with a text memo.",
      destinationLookup(required),
      () => txFrom(user, [pay(required.publicKey())], { memo: Memo.text("invoice 7") }),
      user,
    ],
    [
      "memo-payment-muxed",
      "payment to an M address of an account with config.memo_required = 1, no memo.",
      destinationLookup(required),
      () => txFrom(user, [pay(requiredMuxed)]),
      user,
    ],
    [
      "memo-payment-not-required",
      "payment to an account with no config.memo_required entry, no memo.",
      destinationLookup(plain),
      () => txFrom(user, [pay(plain.publicKey())]),
      user,
    ],
    [
      "memo-second-op",
      "Two payments, no memo: the first to an account without the entry, the second to one with config.memo_required = 1.",
      { ...destinationLookup(required), other: `accounts/${plain.publicKey()}` },
      () => txFrom(user, [pay(plain.publicKey()), pay(required.publicKey())]),
      user,
    ],
    [
      "memo-path-send-none",
      "pathPaymentStrictSend XLM → XLM to an account with config.memo_required = 1, no memo.",
      destinationLookup(required),
      () =>
        txFrom(user, [
          Operation.pathPaymentStrictSend({
            sendAsset: XLM,
            sendAmount: "1",
            destination: required.publicKey(),
            destAsset: XLM,
            destMin: "1",
          }),
        ]),
      user,
    ],
    [
      "memo-path-receive-none",
      "pathPaymentStrictReceive XLM → XLM to an account with config.memo_required = 1, no memo.",
      destinationLookup(required),
      () =>
        txFrom(user, [
          Operation.pathPaymentStrictReceive({
            sendAsset: XLM,
            sendMax: "1",
            destination: required.publicKey(),
            destAsset: XLM,
            destAmount: "1",
          }),
        ]),
      user,
    ],
    [
      "memo-create-account",
      "createAccount for a new account, no memo: not an operation SEP-29 checks.",
      {},
      () =>
        txFrom(user, [
          Operation.createAccount({
            destination: Keypair.random().publicKey(),
            startingBalance: "1",
          }),
        ]),
      user,
    ],
    // Last: it removes `merged`.
    [
      "memo-merge-none",
      "accountMerge into an account with config.memo_required = 1, no memo.",
      destinationLookup(required),
      () => txFrom(merged, [Operation.accountMerge({ destination: required.publicKey() })]),
      merged,
    ],
  ];
  // Built one at a time: each needs the sequence number left by the one before.
  for (const [name, description, lookups, build, signer] of cases) {
    await captureMarket(name, description, lookups, await build(), signer);
  }
}

const indexPath = `${OPS_DIR}/_index.json`;
const index =
  /** @type {{ opTypes: Record<string, string[]>; fixtures: Record<string, unknown> }} */ (
    readJson(indexPath)
  );
for (const [name, entry] of Object.entries(added)) {
  index.fixtures[name] = entry;
  for (const t of new Set(entry.opTypes)) {
    const names = (index.opTypes[t] ??= []);
    if (!names.includes(name)) names.push(name);
  }
}
await writeJson(indexPath, index);
process.stdout.write(`Done: ${String(Object.keys(added).length)} fixtures.\n`);
