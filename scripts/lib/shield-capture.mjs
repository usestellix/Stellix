// Shared helpers for the Shield fixture capture scripts (TESTING §1: fixtures are captured from
// testnet, never generated). Node-only; never imported by packages/.
import {
  Account,
  FeeBumpTransaction,
  MuxedAccount,
  TransactionBuilder,
} from "@stellar/stellar-sdk/base";

/** @typedef {import("@stellar/stellar-sdk/base").Keypair} Keypair */
/** @typedef {import("@stellar/stellar-sdk/base").Memo<import("@stellar/stellar-sdk/base").MemoType>} AnyMemo */
/** @typedef {import("@stellar/stellar-sdk/base").xdr.Operation} XdrOperation */
import { writeFileSync } from "node:fs";
import { format, resolveConfig } from "prettier";

export const HORIZON = "https://horizon-testnet.stellar.org";
export const FRIENDBOT = "https://friendbot.stellar.org";
export const PASSPHRASE = "Test SDF Network ; September 2015";
/** Where transaction fixtures live (decoded by the Shield tests). */
export const OPS_DIR = "packages/core/src/security/__fixtures__/ops";

/** @param {string} url @param {RequestInit} [init] */
export async function get(url, init) {
  const headers = new Headers(init?.headers);
  headers.set("Accept", "application/json");
  const res = await fetch(url, { ...init, headers });
  return { status: res.status, body: /** @type {unknown} */ (await res.json()) };
}

/** @param {number} ms */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Writes JSON formatted as Prettier would, so `pnpm format:check` passes on a fresh capture. @param {string} path @param {unknown} value */
export async function writeJson(path, value) {
  writeFileSync(
    path,
    await format(JSON.stringify(value), { ...(await resolveConfig(path)), filepath: path }),
  );
}

/** @param {Keypair} kp */
export async function fund(kp) {
  const res = await get(`${FRIENDBOT}/?addr=${kp.publicKey()}`);
  if (res.status !== 200) throw new Error(`friendbot failed for ${kp.publicKey()}`);
}

/** @param {Keypair} kp */
export async function seqOf(kp) {
  const res = /** @type {{ status: number; body: { sequence: string } }} */ (
    await get(`${HORIZON}/accounts/${kp.publicKey()}`)
  );
  if (res.status !== 200) throw new Error(`account ${kp.publicKey()} not found`);
  return res.body.sequence;
}

export async function latestLedger() {
  const res = /** @type {{ body: { _embedded: { records: { sequence: number }[] } } }} */ (
    await get(`${HORIZON}/ledgers?order=desc&limit=1`)
  );
  const latest = res.body._embedded.records[0];
  if (latest === undefined) throw new Error("no ledgers");
  return latest.sequence;
}

/**
 * @typedef {{
 *   timeout?: number;
 *   memo?: AnyMemo;
 *   muxedId?: string;
 *   preconditions?: Partial<NonNullable<ConstructorParameters<typeof TransactionBuilder>[1]>>;
 * }} TxOptions
 */

/**
 * Builds an unsigned transaction from `kp` with fresh sequence.
 * @param {Keypair} kp @param {XdrOperation[]} ops @param {TxOptions} [opts]
 */
export async function txFrom(kp, ops, opts = {}) {
  const base = new Account(kp.publicKey(), await seqOf(kp));
  const source = opts.muxedId === undefined ? base : new MuxedAccount(base, opts.muxedId);
  const builder = new TransactionBuilder(source, {
    fee: "1000",
    networkPassphrase: PASSPHRASE,
    ...opts.preconditions,
  });
  for (const op of ops) builder.addOperation(op);
  if (opts.memo !== undefined) builder.addMemo(opts.memo);
  if (opts.preconditions?.timebounds === undefined) builder.setTimeout(opts.timeout ?? 180);
  return builder.build();
}

/** @param {string} hash */
export async function waitFor(hash) {
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const res = await get(`${HORIZON}/transactions/${hash}`);
    if (res.status === 200) return res;
  }
  throw new Error(`transaction ${hash} not found`);
}

/**
 * Signs and submits; resolves to the Horizon transaction record once it's in a ledger.
 * @param {import("@stellar/stellar-sdk/base").Transaction | FeeBumpTransaction} tx
 * @param {Keypair[]} signers
 */
export async function submit(tx, signers) {
  tx.sign(...signers);
  const res = await get(`${HORIZON}/transactions_async`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ tx: tx.toXdr() }).toString(),
  });
  const body = /** @type {{ tx_status?: string; hash?: string }} */ (res.body);
  if (res.status !== 201 || body.tx_status !== "PENDING" || body.hash === undefined) {
    throw new Error(`submit failed: ${JSON.stringify(res.body)}`);
  }
  const record = await waitFor(body.hash);
  if (!(/** @type {{ successful: boolean }} */ (record.body).successful)) {
    throw new Error(`transaction ${body.hash} failed: ${JSON.stringify(record.body)}`);
  }
  return record;
}

/**
 * XDR `OperationType` names, in order. The SDK splits revokeSponsorship into one type per variant.
 * @param {import("@stellar/stellar-sdk/base").Transaction | FeeBumpTransaction} tx
 */
export function opTypesOf(tx) {
  const inner = tx instanceof FeeBumpTransaction ? tx.innerTransaction : tx;
  return inner.operations.map((op) =>
    op.type.startsWith("revoke") ? "revokeSponsorship" : op.type,
  );
}

/**
 * Submits `tx` and writes it as `<OPS_DIR>/<name>.json`. Returns the `_index.json` entry.
 * @param {string} name file name (scenario)
 * @param {string} opType the operation (or envelope feature) this fixture exists for
 * @param {string} description
 * @param {import("@stellar/stellar-sdk/base").Transaction | FeeBumpTransaction} tx
 * @param {Keypair[]} signers
 */
export async function captureOpFixture(name, opType, description, tx, signers) {
  const record = await submit(tx, signers);
  const opTypes = opTypesOf(tx);
  const envelopeType =
    tx instanceof FeeBumpTransaction ? "envelopeTypeTxFeeBump" : "envelopeTypeTx";
  await writeJson(`${OPS_DIR}/${name}.json`, {
    name,
    opType,
    opTypes,
    description,
    envelopeType,
    networkPassphrase: PASSPHRASE,
    capturedAt: new Date().toISOString(),
    hash: Buffer.from(tx.hash()).toString("hex"),
    envelopeXdr: tx.toXdr(),
    transaction: record,
  });
  process.stdout.write(`  ${name}.json (${opTypes.join(", ")})\n`);
  return { record, entry: { opType, opTypes, envelopeType } };
}
