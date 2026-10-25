// Captures Shield fixtures that capture-shield-fixtures.mjs doesn't, from TESTNET (TESTING §1:
// captured, never generated). Additive: it rewrites only its own files and merges its entries
// into the ops `_index.json`, so the main capture's fixtures (and the test constants built on
// their accounts) stay as they are. After re-running the main script, re-run this one.
//
// Usage: node scripts/capture-shield-extra-fixtures.mjs <group>…
//   preconditions   a transaction without preconditions (PRECOND_NONE)
import { Asset, Keypair, Operation, TransactionBuilder, xdr } from "@stellar/stellar-sdk/base";
import { readFileSync } from "node:fs";
import {
  OPS_DIR,
  PASSPHRASE,
  captureOpFixture,
  fund,
  txFrom,
  writeJson,
} from "./lib/shield-capture.mjs";

const GROUPS = ["preconditions"];
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
