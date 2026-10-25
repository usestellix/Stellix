// Captures one real TESTNET transaction per classic operation type into
// packages/core/src/security/__fixtures__/ops/ (SHIELD §9 S1, §10.1; TESTING §1: fixtures are
// captured, never generated; they're public data, so nothing is scrubbed).
//
// Every account is a fresh Friendbot account. Each fixture holds the signed envelope XDR, the
// Horizon transaction record, the operation type(s), the network passphrase and the capture date.
// `_index.json` maps every operation type to the fixtures that contain it; the script fails if an
// S1 operation type has none. Re-run when the protocol or Horizon changes; every file is rewritten.
//
// Usage: node scripts/capture-shield-fixtures.mjs
import {
  Account,
  Asset,
  AuthClawbackEnabledFlag,
  AuthRequiredFlag,
  AuthRevocableFlag,
  Claimant,
  Keypair,
  LiquidityPoolAsset,
  LiquidityPoolFeeV18,
  LiquidityPoolId,
  Memo,
  MuxedAccount,
  Operation,
  StrKey,
  TimeoutInfinite,
  TransactionBuilder,
  getLiquidityPoolId,
  xdr,
} from "@stellar/stellar-sdk/base";
import { randomBytes } from "node:crypto";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import {
  OPS_DIR,
  PASSPHRASE,
  HORIZON,
  captureOpFixture,
  fund,
  get,
  latestLedger,
  seqOf,
  sleep,
  submit,
  txFrom,
  writeJson,
} from "./lib/shield-capture.mjs";

const OUT = OPS_DIR;

/** The classic operation types SHIELD §9 S1 requires a fixture for (XDR `OperationType` names). */
const S1_OP_TYPES = [
  "createAccount",
  "payment",
  "pathPaymentStrictReceive",
  "pathPaymentStrictSend",
  "manageSellOffer",
  "manageBuyOffer",
  "createPassiveSellOffer",
  "setOptions",
  "changeTrust",
  "allowTrust",
  "accountMerge",
  "manageData",
  "bumpSequence",
  "createClaimableBalance",
  "claimClaimableBalance",
  "beginSponsoringFutureReserves",
  "endSponsoringFutureReserves",
  "revokeSponsorship",
  "clawback",
  "clawbackClaimableBalance",
  "setTrustLineFlags",
  "liquidityPoolDeposit",
  "liquidityPoolWithdraw",
];

/** @type {Record<string, { opType: string; opTypes: string[]; envelopeType: string }>} */
const index = {};

/**
 * Submits `tx`, writes it as fixture `<name>.json` and records it in the index.
 * @param {string} name @param {string} opType @param {string} description
 * @param {import("@stellar/stellar-sdk/base").Transaction | import("@stellar/stellar-sdk/base").FeeBumpTransaction} tx
 * @param {Keypair[]} signers
 */
async function capture(name, opType, description, tx, signers) {
  const { record, entry } = await captureOpFixture(name, opType, description, tx, signers);
  index[name] = entry;
  return record;
}

/** Newest offer id of `seller` (Horizon has ingested it once `waitFor` returned). @param {Keypair} seller */
async function newestOfferId(seller) {
  const res = /** @type {{ body: { _embedded: { records: { id: string }[] } } }} */ (
    await get(`${HORIZON}/accounts/${seller.publicKey()}/offers?order=desc&limit=1`)
  );
  const offer = res.body._embedded.records[0];
  if (offer === undefined) throw new Error(`no offers for ${seller.publicKey()}`);
  return offer.id;
}

// Start clean so a removed scenario can't leave a stale fixture behind.
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith(".json")) rmSync(`${OUT}/${f}`);

const user = Keypair.random(); // the wallet user in most scenarios
const peer = Keypair.random(); // counterparty; also the fee-bump fee source
const clawIssuer = Keypair.random(); // auth required + revocable + clawback enabled
const plainIssuer = Keypair.random(); // no flags
const config = Keypair.random(); // setOptions / manageData / bumpSequence
const sponsored = Keypair.random(); // entries sponsored by `user`
process.stdout.write("Funding accounts via Friendbot…\n");
for (const kp of [user, peer, clawIssuer, plainIssuer, config, sponsored]) await fund(kp);

const CLAW = new Asset("CLAW", clawIssuer.publicKey());
const PLN = new Asset("PLN", plainIssuer.publicKey());
const RMV = new Asset("RMV", plainIssuer.publicKey());
const pool = new LiquidityPoolAsset(Asset.native(), PLN, LiquidityPoolFeeV18);
const poolId = Buffer.from(
  getLiquidityPoolId("constant_product", pool.getLiquidityPoolParameters()),
).toString("hex");

// --- Trust / issuer group ---------------------------------------------------------------------

await capture(
  "setOptions-set-flags",
  "setOptions",
  "Issuer sets auth required, auth revocable and auth clawback enabled.",
  await txFrom(clawIssuer, [
    Operation.setOptions({
      setFlags: /** @type {import("@stellar/stellar-sdk/base").AuthFlag} */ (
        AuthRequiredFlag | AuthRevocableFlag | AuthClawbackEnabledFlag
      ),
    }),
  ]),
  [clawIssuer],
);
await capture(
  "changeTrust-asset",
  "changeTrust",
  "User adds a trustline to a credit asset with an explicit limit.",
  await txFrom(user, [Operation.changeTrust({ asset: CLAW, limit: "1000000" })]),
  [user],
);
await submit(await txFrom(user, [Operation.changeTrust({ asset: PLN })]), [user]); // setup
await submit(
  await txFrom(peer, [
    Operation.changeTrust({ asset: CLAW }),
    Operation.changeTrust({ asset: PLN }),
  ]),
  [peer],
); // setup
await capture(
  "allowTrust",
  "allowTrust",
  "Issuer authorizes the user's trustline (authorize = 1).",
  await txFrom(clawIssuer, [
    // Deprecated in the SDK in favour of setTrustLineFlags, but still a valid classic op to decode.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    Operation.allowTrust({ trustor: user.publicKey(), assetCode: "CLAW", authorize: 1 }),
  ]),
  [clawIssuer],
);
await capture(
  "setTrustLineFlags",
  "setTrustLineFlags",
  "Issuer sets the authorized flag on the peer's trustline.",
  await txFrom(clawIssuer, [
    Operation.setTrustLineFlags({
      trustor: peer.publicKey(),
      asset: CLAW,
      flags: { authorized: true },
    }),
  ]),
  [clawIssuer],
);

// --- Payment group ----------------------------------------------------------------------------

await capture(
  "payment-credit",
  "payment",
  "Issuer issues 1000 CLAW to the user.",
  await txFrom(clawIssuer, [
    Operation.payment({ destination: user.publicKey(), asset: CLAW, amount: "1000" }),
  ]),
  [clawIssuer],
);
await submit(
  await txFrom(plainIssuer, [
    Operation.payment({ destination: user.publicKey(), asset: PLN, amount: "10000" }),
    Operation.payment({ destination: peer.publicKey(), asset: PLN, amount: "1000" }),
  ]),
  [plainIssuer],
); // setup
await capture(
  "payment-native",
  "payment",
  "User pays 1 XLM to the peer, with a text memo.",
  await txFrom(
    user,
    [Operation.payment({ destination: peer.publicKey(), asset: Asset.native(), amount: "1" })],
    { memo: Memo.text("shield fixture") },
  ),
  [user],
);
const peerMuxed = new MuxedAccount(new Account(peer.publicKey(), "0"), "424242").accountId();
await capture(
  "payment-muxed-destination",
  "payment",
  "User pays 1.25 XLM to a muxed (M…) destination.",
  await txFrom(user, [
    Operation.payment({ destination: peerMuxed, asset: Asset.native(), amount: "1.25" }),
  ]),
  [user],
);
const peerMuxedSource = new MuxedAccount(new Account(peer.publicKey(), "0"), "7").accountId();
await capture(
  "payment-muxed-sources",
  "payment",
  "Muxed transaction source (user, id 1); the op's source is a muxed peer account paying the user.",
  await txFrom(
    user,
    [
      Operation.payment({
        source: peerMuxedSource,
        destination: user.publicKey(),
        asset: Asset.native(),
        amount: "2",
      }),
    ],
    { muxedId: "1" },
  ),
  [user, peer],
);
const created = Keypair.random();
await capture(
  "createAccount",
  "createAccount",
  "User creates a new account with a 2 XLM starting balance.",
  await txFrom(user, [
    Operation.createAccount({ destination: created.publicKey(), startingBalance: "2" }),
  ]),
  [user],
);
await capture(
  "clawback",
  "clawback",
  "Issuer claws back 10 CLAW from the user.",
  await txFrom(clawIssuer, [
    Operation.clawback({ from: user.publicKey(), asset: CLAW, amount: "10" }),
  ]),
  [clawIssuer],
);

// --- DEX group --------------------------------------------------------------------------------

await capture(
  "manageSellOffer-create",
  "manageSellOffer",
  "User offers to sell 100 PLN for XLM at 1 XLM/PLN (new offer, offerId 0).",
  await txFrom(user, [
    Operation.manageSellOffer({
      selling: PLN,
      buying: Asset.native(),
      amount: "100",
      price: "1",
    }),
  ]),
  [user],
);
const sellOfferId = await newestOfferId(user);
await capture(
  "manageSellOffer-update",
  "manageSellOffer",
  "User updates the existing offer: 50 PLN at 3/2 XLM/PLN (offerId ≠ 0).",
  await txFrom(user, [
    Operation.manageSellOffer({
      selling: PLN,
      buying: Asset.native(),
      amount: "50",
      price: { n: 3, d: 2 },
      offerId: sellOfferId,
    }),
  ]),
  [user],
);
await capture(
  "manageSellOffer-delete",
  "manageSellOffer",
  "User deletes the offer (amount 0).",
  await txFrom(user, [
    Operation.manageSellOffer({
      selling: PLN,
      buying: Asset.native(),
      amount: "0",
      price: { n: 3, d: 2 },
      offerId: sellOfferId,
    }),
  ]),
  [user],
);
await capture(
  "manageBuyOffer-create",
  "manageBuyOffer",
  "Peer bids to buy 10 PLN with XLM at 1/2 XLM/PLN (doesn't cross).",
  await txFrom(peer, [
    Operation.manageBuyOffer({
      selling: Asset.native(),
      buying: PLN,
      buyAmount: "10",
      price: { n: 1, d: 2 },
    }),
  ]),
  [peer],
);
await capture(
  "createPassiveSellOffer",
  "createPassiveSellOffer",
  "User places a passive offer: 10 PLN at 2 XLM/PLN.",
  await txFrom(user, [
    Operation.createPassiveSellOffer({
      selling: PLN,
      buying: Asset.native(),
      amount: "10",
      price: "2",
    }),
  ]),
  [user],
);
// Liquidity for the path payments: PLN for XLM at 1, and CLAW for PLN at 1.
await submit(
  await txFrom(user, [
    Operation.manageSellOffer({ selling: PLN, buying: Asset.native(), amount: "100", price: "1" }),
    Operation.manageSellOffer({ selling: CLAW, buying: PLN, amount: "100", price: "1" }),
  ]),
  [user],
); // setup
await capture(
  "pathPaymentStrictSend",
  "pathPaymentStrictSend",
  "Peer sends exactly 1 XLM to itself, receiving at least 0.5 PLN (empty path).",
  await txFrom(peer, [
    Operation.pathPaymentStrictSend({
      sendAsset: Asset.native(),
      sendAmount: "1",
      destination: peer.publicKey(),
      destAsset: PLN,
      destMin: "0.5",
      path: [],
    }),
  ]),
  [peer],
);
await capture(
  "pathPaymentStrictReceive",
  "pathPaymentStrictReceive",
  "Peer receives exactly 1 CLAW, paying at most 5 XLM, via a one-hop path through PLN.",
  await txFrom(peer, [
    Operation.pathPaymentStrictReceive({
      sendAsset: Asset.native(),
      sendMax: "5",
      destination: peer.publicKey(),
      destAsset: CLAW,
      destAmount: "1",
      path: [PLN],
    }),
  ]),
  [peer],
);
await capture(
  "changeTrust-pool-share",
  "changeTrust",
  "User adds a pool-share trustline for the XLM/PLN constant-product pool.",
  await txFrom(user, [Operation.changeTrust({ asset: pool })]),
  [user],
);
await capture(
  "liquidityPoolDeposit",
  "liquidityPoolDeposit",
  "User makes the first deposit into the XLM/PLN pool (creates its reserves).",
  await txFrom(user, [
    Operation.liquidityPoolDeposit({
      liquidityPoolId: poolId,
      maxAmountA: "100",
      maxAmountB: "100",
      minPrice: { n: 1, d: 2 },
      maxPrice: { n: 2, d: 1 },
    }),
  ]),
  [user],
);
await capture(
  "liquidityPoolWithdraw",
  "liquidityPoolWithdraw",
  "User withdraws 10 pool shares from the XLM/PLN pool.",
  await txFrom(user, [
    Operation.liquidityPoolWithdraw({
      liquidityPoolId: poolId,
      amount: "10",
      minAmountA: "1",
      minAmountB: "1",
    }),
  ]),
  [user],
);

// --- Account-config group ---------------------------------------------------------------------

await capture(
  "setOptions-account-fields",
  "setOptions",
  "Sets inflation destination, home domain, master weight, all three thresholds and a flag.",
  await txFrom(config, [
    Operation.setOptions({
      inflationDest: peer.publicKey(),
      homeDomain: "example.com",
      masterWeight: 10,
      lowThreshold: 1,
      medThreshold: 2,
      highThreshold: 3,
      setFlags: /** @type {import("@stellar/stellar-sdk/base").AuthFlag} */ (AuthRevocableFlag),
    }),
  ]),
  [config],
);
await capture(
  "setOptions-clear-flags",
  "setOptions",
  "Clears the auth revocable flag.",
  await txFrom(config, [
    Operation.setOptions({
      clearFlags: /** @type {import("@stellar/stellar-sdk/base").AuthFlag} */ (AuthRevocableFlag),
    }),
  ]),
  [config],
);
const extraSigner = Keypair.random();
await capture(
  "setOptions-signer-ed25519",
  "setOptions",
  "Adds an ed25519 signer with weight 1.",
  await txFrom(config, [
    Operation.setOptions({ signer: { ed25519PublicKey: extraSigner.publicKey(), weight: 1 } }),
  ]),
  [config],
);
await capture(
  "setOptions-signer-pre-auth-tx",
  "setOptions",
  "Adds a pre-authorized transaction signer (hash of a transaction) with weight 1.",
  await txFrom(config, [
    Operation.setOptions({ signer: { preAuthTx: randomBytes(32), weight: 1 } }),
  ]),
  [config],
);
await capture(
  "setOptions-signer-sha256-hash",
  "setOptions",
  "Adds a hash(x) signer with weight 1.",
  await txFrom(config, [
    Operation.setOptions({ signer: { sha256Hash: randomBytes(32), weight: 1 } }),
  ]),
  [config],
);
const payloadSigner = StrKey.encodeSignedPayload(
  new xdr.SignerKeyEd25519SignedPayload({
    ed25519: Keypair.random().rawPublicKey(),
    payload: Buffer.from("stellix shield fixture"),
  }).toXdr(),
);
await capture(
  "setOptions-signer-signed-payload",
  "setOptions",
  "Adds an ed25519 signed-payload signer (CAP-40) with weight 1.",
  await txFrom(config, [
    Operation.setOptions({ signer: { ed25519SignedPayload: payloadSigner, weight: 1 } }),
  ]),
  [config],
);
await capture(
  "setOptions-signer-remove",
  "setOptions",
  "Removes the ed25519 signer (weight 0).",
  await txFrom(config, [
    Operation.setOptions({ signer: { ed25519PublicKey: extraSigner.publicKey(), weight: 0 } }),
  ]),
  [config],
);
await capture(
  "manageData-set",
  "manageData",
  "Sets data entry `stellix-fixture`.",
  await txFrom(config, [Operation.manageData({ name: "stellix-fixture", value: "shield" })]),
  [config],
);
await capture(
  "manageData-delete",
  "manageData",
  "Deletes data entry `stellix-fixture` (null value).",
  await txFrom(config, [Operation.manageData({ name: "stellix-fixture", value: null })]),
  [config],
);
await capture(
  "bumpSequence",
  "bumpSequence",
  "Bumps the account's sequence number 100 ahead.",
  await txFrom(config, [
    Operation.bumpSequence({ bumpTo: (BigInt(await seqOf(config)) + 100n).toString() }),
  ]),
  [config],
);
await submit(await txFrom(config, [Operation.changeTrust({ asset: RMV })]), [config]); // setup
await capture(
  "changeTrust-remove",
  "changeTrust",
  "Removes a zero-balance trustline (limit 0).",
  await txFrom(config, [Operation.changeTrust({ asset: RMV, limit: "0" })]),
  [config],
);
await capture(
  "accountMerge",
  "accountMerge",
  "The account the user created merges into the user.",
  await txFrom(created, [Operation.accountMerge({ destination: user.publicKey() })]),
  [created],
);

// --- Claimable balances -----------------------------------------------------------------------

const yearFromNow = String(Math.floor(Date.now() / 1000) + 365 * 24 * 3600);
const createCb = await txFrom(user, [
  Operation.createClaimableBalance({
    asset: Asset.native(),
    amount: "5",
    claimants: [
      new Claimant(peer.publicKey(), Claimant.predicateUnconditional()),
      new Claimant(
        user.publicKey(),
        Claimant.predicateOr(
          Claimant.predicateAnd(
            Claimant.predicateNot(Claimant.predicateBeforeRelativeTime("3600")),
            Claimant.predicateBeforeAbsoluteTime(yearFromNow),
          ),
          Claimant.predicateBeforeRelativeTime("60"),
        ),
      ),
    ],
  }),
]);
await capture(
  "createClaimableBalance",
  "createClaimableBalance",
  "User locks 5 XLM: the peer can claim any time; the user with nested and/or/not time predicates.",
  createCb,
  [user],
);
await capture(
  "claimClaimableBalance",
  "claimClaimableBalance",
  "Peer claims the balance.",
  await txFrom(peer, [
    Operation.claimClaimableBalance({ balanceId: createCb.getClaimableBalanceId(0) }),
  ]),
  [peer],
);
const createClawCb = await txFrom(user, [
  Operation.createClaimableBalance({
    asset: CLAW,
    amount: "5",
    claimants: [new Claimant(peer.publicKey(), Claimant.predicateUnconditional())],
  }),
]);
await submit(createClawCb, [user]); // setup
await capture(
  "clawbackClaimableBalance",
  "clawbackClaimableBalance",
  "Issuer claws back a 5 CLAW claimable balance.",
  await txFrom(clawIssuer, [
    Operation.clawbackClaimableBalance({ balanceId: createClawCb.getClaimableBalanceId(0) }),
  ]),
  [clawIssuer],
);

// --- Sponsorship ------------------------------------------------------------------------------

const sponsoredNew = Keypair.random();
await capture(
  "sponsorship-create-account",
  "beginSponsoringFutureReserves",
  "Begin/end sandwich: the user sponsors a new account's base reserve.",
  await txFrom(user, [
    Operation.beginSponsoringFutureReserves({ sponsoredId: sponsoredNew.publicKey() }),
    Operation.createAccount({ destination: sponsoredNew.publicKey(), startingBalance: "5" }),
    Operation.endSponsoringFutureReserves({ source: sponsoredNew.publicKey() }),
  ]),
  [user, sponsoredNew],
);
const sponsoredSigner = Keypair.random();
const sponsoredEntries = await txFrom(user, [
  Operation.beginSponsoringFutureReserves({ sponsoredId: sponsored.publicKey() }),
  Operation.changeTrust({ source: sponsored.publicKey(), asset: PLN }),
  Operation.changeTrust({ source: sponsored.publicKey(), asset: pool }),
  Operation.manageData({ source: sponsored.publicKey(), name: "sponsored", value: "1" }),
  Operation.setOptions({
    source: sponsored.publicKey(),
    signer: { ed25519PublicKey: sponsoredSigner.publicKey(), weight: 1 },
  }),
  Operation.manageSellOffer({
    source: sponsored.publicKey(),
    selling: Asset.native(),
    buying: PLN,
    amount: "1",
    price: "100",
  }),
  Operation.createClaimableBalance({
    source: sponsored.publicKey(),
    asset: Asset.native(),
    amount: "1",
    claimants: [new Claimant(peer.publicKey(), Claimant.predicateUnconditional())],
  }),
  Operation.endSponsoringFutureReserves({ source: sponsored.publicKey() }),
]);
await capture(
  "sponsorship-entries",
  "endSponsoringFutureReserves",
  "Begin/end sandwich: the user sponsors another account's trustlines, data, signer, offer and claimable balance.",
  sponsoredEntries,
  [user, sponsored],
);
const sponsoredOfferId = await newestOfferId(sponsored);
const sponsoredCbId = sponsoredEntries.getClaimableBalanceId(6);

/** @type {[string, string, xdr.Operation][]} */
const revocations = [
  [
    "revokeSponsorship-account",
    "Sponsor stops sponsoring an account's base reserve.",
    Operation.revokeAccountSponsorship({ account: sponsoredNew.publicKey() }),
  ],
  [
    "revokeSponsorship-trustline",
    "Sponsor stops sponsoring a credit-asset trustline.",
    Operation.revokeTrustlineSponsorship({ account: sponsored.publicKey(), asset: PLN }),
  ],
  [
    "revokeSponsorship-pool-share-trustline",
    "Sponsor stops sponsoring a pool-share trustline.",
    Operation.revokeTrustlineSponsorship({
      account: sponsored.publicKey(),
      asset: new LiquidityPoolId(poolId),
    }),
  ],
  [
    "revokeSponsorship-offer",
    "Sponsor stops sponsoring an offer.",
    Operation.revokeOfferSponsorship({ seller: sponsored.publicKey(), offerId: sponsoredOfferId }),
  ],
  [
    "revokeSponsorship-data",
    "Sponsor stops sponsoring a data entry.",
    Operation.revokeDataSponsorship({ account: sponsored.publicKey(), name: "sponsored" }),
  ],
  [
    "revokeSponsorship-signer",
    "Sponsor stops sponsoring a signer.",
    Operation.revokeSignerSponsorship({
      account: sponsored.publicKey(),
      signer: { ed25519PublicKey: sponsoredSigner.publicKey() },
    }),
  ],
];
for (const [name, description, op] of revocations) {
  await capture(name, "revokeSponsorship", description, await txFrom(user, [op]), [user]);
}
// A claimable balance is always sponsored, so its sponsorship can only be transferred: the peer
// takes it over inside a begin/end sandwich. (Liquidity pool entries are never sponsored, so the
// liquidityPool variant of revokeSponsorship can't succeed on chain and has no fixture.)
await capture(
  "revokeSponsorship-claimable-balance",
  "revokeSponsorship",
  "Sponsorship of a claimable balance is transferred from the user to the peer.",
  await txFrom(user, [
    Operation.beginSponsoringFutureReserves({
      source: peer.publicKey(),
      sponsoredId: user.publicKey(),
    }),
    Operation.revokeClaimableBalanceSponsorship({ balanceId: sponsoredCbId }),
    Operation.endSponsoringFutureReserves({}),
  ]),
  [user, peer],
);

// --- Envelope and preconditions ---------------------------------------------------------------

const inner = await txFrom(user, [
  Operation.payment({ destination: peer.publicKey(), asset: Asset.native(), amount: "1" }),
]);
inner.sign(user);
await capture(
  "feeBump",
  "feeBump",
  "The peer fee-bumps the user's 1 XLM payment (fee source ≠ inner source).",
  TransactionBuilder.buildFeeBumpTransaction(peer, "2000", inner, PASSPHRASE),
  [peer],
);
await capture(
  "preconditions-no-max-time",
  "preconditions",
  "Payment with no upper time bound (maxTime 0).",
  await txFrom(
    user,
    [Operation.payment({ destination: peer.publicKey(), asset: Asset.native(), amount: "1" })],
    { timeout: TimeoutInfinite },
  ),
  [user],
);
// minAccountSequenceAge / LedgerGap are measured from the account's last sequence change.
await sleep(6000);
const extra = Keypair.random();
const ledger = await latestLedger();
const nowSeconds = Math.floor(Date.now() / 1000);
await capture(
  "preconditions-all",
  "preconditions",
  "Every v2 precondition: time bounds, ledger bounds, min sequence, min sequence age and ledger gap, and an extra signer.",
  await txFrom(
    user,
    [Operation.payment({ destination: peer.publicKey(), asset: Asset.native(), amount: "1" })],
    {
      preconditions: {
        timebounds: { minTime: nowSeconds - 60, maxTime: nowSeconds + 180 },
        ledgerbounds: { minLedger: ledger, maxLedger: ledger + 100 },
        minAccountSequence: await seqOf(user),
        minAccountSequenceAge: 1n,
        minAccountSequenceLedgerGap: 1,
        extraSigners: [extra.publicKey()],
      },
    },
  ),
  [user, extra],
);

// --- Index and coverage -----------------------------------------------------------------------

/** @type {Record<string, string[]>} */
const byOpType = {};
for (const [name, entry] of Object.entries(index)) {
  for (const t of new Set(entry.opTypes)) (byOpType[t] ??= []).push(name);
}
const missing = S1_OP_TYPES.filter((t) => byOpType[t] === undefined);
if (missing.length > 0) throw new Error(`no fixture for: ${missing.join(", ")}`);

const root =
  /** @type {{ body: { horizon_version: string; current_protocol_version: number } }} */ (
    await get(`${HORIZON}/`)
  );
await writeJson(`${OUT}/_index.json`, {
  capturedAt: new Date().toISOString(),
  network: "testnet",
  networkPassphrase: PASSPHRASE,
  horizonVersion: root.body.horizon_version,
  protocolVersion: root.body.current_protocol_version,
  opTypes: byOpType,
  fixtures: index,
});
process.stdout.write(`Done: ${String(Object.keys(index).length)} fixtures.\n`);
