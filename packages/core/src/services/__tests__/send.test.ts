import { Keypair, MuxedAccount, Account, TransactionBuilder } from "@stellar/stellar-sdk/base";
import { describe, expect, it } from "vitest";
import { StellixError } from "../../errors.js";
import { NETWORKS } from "../../network/config.js";
import {
  accountSchema,
  type AccountRecord,
  type TransactionRecord,
} from "../../network/horizon-schemas.js";
import { fixture } from "../../network/__tests__/fixtures.js";
import { FakeHorizonClient } from "../../testing/fake-horizon.js";
import { createFakePlatform, type FakePlatform } from "../../testing/fake-platform.js";
import { importWallet } from "../onboarding.js";
import { resetWallet } from "../secrets.js";
import {
  awaitOutcome,
  cancelPayment,
  confirmPayment,
  dismissOutcome,
  listInflight,
  preparePayment,
  resumeInflight,
  submitPrepared,
} from "../send.js";
import { lock } from "../session.js";
import { ABANDON, ABANDON_G0, CLICK, FAST_SCRYPT, PASSWORD, codeOf } from "./helpers.js";

const template = accountSchema.parse(fixture("account-funded").body);
const success = fixture("transaction-success").body as TransactionRecord;
const failedTx = fixture("transaction-failed").body as TransactionRecord;

function account(id: string, overrides: Partial<AccountRecord> = {}): AccountRecord {
  return {
    ...template,
    id,
    sequence: "1000",
    signers: [{ key: id, weight: 1, type: "ed25519_public_key" }],
    ...overrides,
  };
}

async function setup() {
  const p: FakePlatform = createFakePlatform(Date.now());
  await importWallet(p, { mnemonic: ABANDON, password: PASSWORD }, { scryptParams: FAST_SCRYPT });
  const h = new FakeHorizonClient();
  h.accounts.set(ABANDON_G0, account(ABANDON_G0));
  h.ledger = {
    sequence: 1,
    base_reserve_in_stroops: 5_000_000,
    base_fee_in_stroops: 100,
    closed_at: "",
  };
  h.feeStats = {
    ...(fixture("fee-stats").body as object),
    last_ledger_base_fee: "100",
    fee_charged: {
      ...(fixture("fee-stats").body as { fee_charged: object }).fee_charged,
      p70: "100",
    },
  } as never;
  const sleep = (ms: number) => {
    p.advance(ms);
    return Promise.resolve();
  };
  const deps = { horizonFor: () => h, sleep };
  return { p, h, deps };
}

const dest = Keypair.random().publicKey();
const pending = (hash: string) => ({ tx_status: "PENDING" as const, hash });

/** Make a submit "land": PENDING now, and the tx appears in the ledger. */
function landOnSubmit(h: FakeHorizonClient, record: TransactionRecord = success) {
  h.onSubmit = (xdr) => {
    const hash = Buffer.from(
      TransactionBuilder.fromXdr(xdr, NETWORKS.testnet.passphrase).hash(),
    ).toString("hex");
    h.submitScript.push(pending(hash));
    h.transactions.set(hash, { ...record, hash, ledger: 777 });
  };
}

describe("preparePayment (TRANSACTIONS §3)", () => {
  it("payment to an existing account: summary from the built tx, stored unsigned", async () => {
    const { p, h, deps } = await setup();
    h.accounts.set(dest, account(dest));
    const { preparedId, summary } = await preparePayment(p, deps, {
      destination: dest,
      amount: "12.5",
      memo: { type: "text", value: "inv 42" },
    });
    expect(summary).toMatchObject({
      kind: "payment",
      source: ABANDON_G0,
      destination: dest,
      amountStroops: "125000000",
      feeStroops: "100",
      totalStroops: "125000100",
      memo: { type: "text", value: "inv 42" },
      network: "testnet",
      firstTimeDestination: true,
      feeEstimated: false,
    });
    const stored = await p.session.get<{ xdr: string }>(`preparedTx:${preparedId}`);
    expect(
      TransactionBuilder.fromXdr(stored!.xdr, NETWORKS.testnet.passphrase).signatures,
    ).toHaveLength(0);
  });

  it("unfunded destination → createAccount", async () => {
    const { p, deps } = await setup();
    expect((await preparePayment(p, deps, { destination: dest, amount: "2" })).summary.kind).toBe(
      "createAccount",
    );
  });

  it("first-time destination is false when it appears in recent payments", async () => {
    const { p, h, deps } = await setup();
    h.accounts.set(dest, account(dest));
    h.payments.set(ABANDON_G0, [
      {
        id: "1",
        type: "payment",
        transaction_hash: "x",
        created_at: "",
        from: ABANDON_G0,
        to: dest,
      },
    ]);
    expect(
      (await preparePayment(p, deps, { destination: dest, amount: "1" })).summary
        .firstTimeDestination,
    ).toBe(false);
  });

  it("SEP-29: memo required → MEMO_REQUIRED; a memo satisfies it; an M address is exempt", async () => {
    const { p, h, deps } = await setup();
    h.accounts.set(dest, account(dest, { data: { "config.memo_required": "MQ==" } }));
    expect(await codeOf(preparePayment(p, deps, { destination: dest, amount: "1" }))).toBe(
      "MEMO_REQUIRED",
    );
    await preparePayment(p, deps, {
      destination: dest,
      amount: "1",
      memo: { type: "id", value: "7" },
    });
    const m = new MuxedAccount(new Account(dest, "0"), "9").accountId();
    await preparePayment(p, deps, { destination: m, amount: "1" });
  });

  it.each([
    ["unfunded source", (h: FakeHorizonClient) => h.accounts.delete(ABANDON_G0), "SOURCE_UNFUNDED"],
    [
      "multisig source",
      (h: FakeHorizonClient) =>
        h.accounts.set(
          ABANDON_G0,
          account(ABANDON_G0, {
            thresholds: { low_threshold: 0, med_threshold: 2, high_threshold: 0 },
          }),
        ),
      "MULTISIG_UNSUPPORTED",
    ],
  ])("%s → %s", async (_n, mutate, expected) => {
    const { p, h, deps } = await setup();
    mutate(h);
    expect(await codeOf(preparePayment(p, deps, { destination: dest, amount: "1" }))).toBe(
      expected,
    );
  });

  it("insufficient balance carries maxSendableStroops (available − fee)", async () => {
    const { p, deps } = await setup();
    const err = await preparePayment(p, deps, { destination: dest, amount: "10000" }).catch(
      (e: unknown) => e,
    );
    expect(err).toMatchObject({
      code: "INSUFFICIENT_BALANCE",
      details: { maxSendableStroops: String(99_990_000_000n - 100n) },
    });
  });

  it("createAccount below 2 × base reserve → BELOW_MIN_STARTING_BALANCE", async () => {
    const { p, deps } = await setup();
    expect(await codeOf(preparePayment(p, deps, { destination: dest, amount: "0.9999999" }))).toBe(
      "BELOW_MIN_STARTING_BALANCE",
    );
  });

  it("fee_stats failure → 1,000 stroops, marked estimated", async () => {
    const { p, h, deps } = await setup();
    h.feeStats = null;
    expect(
      (await preparePayment(p, deps, { destination: dest, amount: "2" })).summary,
    ).toMatchObject({ feeStroops: "1000", feeEstimated: true });
  });

  it("requires unlocked", async () => {
    const { p, deps } = await setup();
    await lock(p);
    expect(await codeOf(preparePayment(p, deps, { destination: dest, amount: "1" }))).toBe(
      "LOCKED",
    );
  });

  it("rejects with TX_IN_FLIGHT while a previous payment is still resolving", async () => {
    const { p, h, deps } = await setup();
    const { preparedId } = await preparePayment(p, deps, { destination: dest, amount: "2" });
    h.submitScript.push({ tx_status: "PENDING", hash: "0".repeat(64) });
    await submitPrepared(p, deps, preparedId, CLICK);
    expect(await codeOf(preparePayment(p, deps, { destination: dest, amount: "2" }))).toBe(
      "TX_IN_FLIGHT",
    );
  });

  it("cancel discards the prepared tx", async () => {
    const { p, deps } = await setup();
    const { preparedId } = await preparePayment(p, deps, { destination: dest, amount: "2" });
    await cancelPayment(p, preparedId);
    expect(await codeOf(submitPrepared(p, deps, preparedId, CLICK))).toBe("PREPARED_TX_NOT_FOUND");
  });
});

describe("confirm (TRANSACTIONS §4–5, ADR 0007)", () => {
  it("signs with the derived key, submits once, resolves to success", async () => {
    const { p, h, deps } = await setup();
    landOnSubmit(h);
    const { preparedId } = await preparePayment(p, deps, { destination: dest, amount: "2" });
    let signedXdr = "";
    const original = h.onSubmit!;
    h.onSubmit = (xdr) => {
      signedXdr = xdr;
      original(xdr);
    };
    const outcome = await confirmPayment(p, deps, preparedId, CLICK);
    expect(outcome).toMatchObject({ status: "success", ledger: 777 });
    expect(h.count("submitTransactionAsync")).toBe(1);
    const tx = TransactionBuilder.fromXdr(signedXdr, NETWORKS.testnet.passphrase);
    expect(tx.signatures).toHaveLength(1);
    // SDK 17's Signature is opaque; its JSON form carries the bytes as hex.
    const { signature } = JSON.parse(JSON.stringify(tx.signatures[0])) as { signature: string };
    expect(Keypair.fromPublicKey(ABANDON_G0).verify(tx.hash(), Buffer.from(signature, "hex"))).toBe(
      true,
    );
  });

  it("consumes the prepared tx before signing: a second confirm gets PREPARED_TX_NOT_FOUND", async () => {
    const { p, h, deps } = await setup();
    landOnSubmit(h);
    const { preparedId } = await preparePayment(p, deps, { destination: dest, amount: "2" });
    await submitPrepared(p, deps, preparedId, CLICK);
    expect(await codeOf(submitPrepared(p, deps, preparedId, CLICK))).toBe("PREPARED_TX_NOT_FOUND");
    expect(h.count("submitTransactionAsync")).toBe(1);
  });

  it("an expired prepared tx is refused and consumed", async () => {
    const { p, deps } = await setup();
    const { preparedId } = await preparePayment(p, deps, { destination: dest, amount: "2" });
    p.advance(171_000);
    expect(await codeOf(submitPrepared(p, deps, preparedId, CLICK))).toBe("PREPARED_TX_EXPIRED");
    expect(await codeOf(submitPrepared(p, deps, preparedId, CLICK))).toBe("PREPARED_TX_NOT_FOUND");
  });

  it("a network switch after review → NETWORK_MISMATCH, nothing submitted", async () => {
    const { p, h, deps } = await setup();
    const { preparedId } = await preparePayment(p, deps, { destination: dest, amount: "2" });
    await p.persistent.set("settings", { network: "mainnet" });
    expect(await codeOf(submitPrepared(p, deps, preparedId, CLICK))).toBe("NETWORK_MISMATCH");
    expect(h.count("submitTransactionAsync")).toBe(0);
  });

  it("DUPLICATE is treated like PENDING and resolved", async () => {
    const { p, h, deps } = await setup();
    h.submitTransactionAsync = (xdr) => {
      const hash = Buffer.from(
        TransactionBuilder.fromXdr(xdr, NETWORKS.testnet.passphrase).hash(),
      ).toString("hex");
      h.transactions.set(hash, { ...success, hash });
      return Promise.resolve({ tx_status: "DUPLICATE" as const, hash });
    };
    const { preparedId } = await preparePayment(p, deps, { destination: dest, amount: "2" });
    expect((await confirmPayment(p, deps, preparedId, CLICK)).status).toBe("success");
  });

  it("TRY_AGAIN_LATER → resubmits the SAME XDR with backoff, then resolves", async () => {
    const { p, h, deps } = await setup();
    const xdrs: string[] = [];
    let first = true;
    h.onSubmit = (xdr) => {
      xdrs.push(xdr);
      const hash = Buffer.from(
        TransactionBuilder.fromXdr(xdr, NETWORKS.testnet.passphrase).hash(),
      ).toString("hex");
      if (first) {
        first = false;
        h.submitScript.push({ tx_status: "TRY_AGAIN_LATER", hash });
      } else {
        h.submitScript.push(pending(hash));
        h.transactions.set(hash, { ...success, hash });
      }
    };
    const { preparedId } = await preparePayment(p, deps, { destination: dest, amount: "2" });
    expect((await confirmPayment(p, deps, preparedId, CLICK)).status).toBe("success");
    expect(xdrs.length).toBeGreaterThanOrEqual(2);
    expect(new Set(xdrs).size).toBe(1);
  });

  it("ERROR (decoded tx_bad_seq) → rebuild, nothing left in flight", async () => {
    const { p, h, deps } = await setup();
    const body = fixture("submit-async-bad-seq").body as { error_result_xdr: string; hash: string };
    h.submitScript.push({
      tx_status: "ERROR",
      hash: body.hash,
      error_result_xdr: body.error_result_xdr,
    });
    const { preparedId } = await preparePayment(p, deps, { destination: dest, amount: "2" });
    expect(await confirmPayment(p, deps, preparedId, CLICK)).toEqual({
      status: "rebuild",
      reason: "bad_seq",
    });
    expect((await listInflight(p))[0]).toMatchObject({ status: "done" });
    await preparePayment(p, deps, { destination: dest, amount: "2" }); // no TX_IN_FLIGHT
  });

  it("failed in a ledger (op_no_destination) → rebuild destination_changed", async () => {
    const { p, h, deps } = await setup();
    landOnSubmit(h, failedTx);
    const { preparedId } = await preparePayment(p, deps, { destination: dest, amount: "2" });
    expect(await confirmPayment(p, deps, preparedId, CLICK)).toEqual({
      status: "rebuild",
      reason: "destination_changed",
    });
  });

  it("network error on submit (ambiguous) → resubmits the same XDR → success", async () => {
    const { p, h, deps } = await setup();
    const xdrs: string[] = [];
    h.submitTransactionAsync = (xdr) => {
      xdrs.push(xdr);
      const hash = Buffer.from(
        TransactionBuilder.fromXdr(xdr, NETWORKS.testnet.passphrase).hash(),
      ).toString("hex");
      // The real client's contract: outcome unknown → NETWORK_ERROR.
      if (xdrs.length === 1)
        return Promise.reject(new StellixError("NETWORK_ERROR", "unknown", true));
      h.transactions.set(hash, { ...success, hash });
      return Promise.resolve(pending(hash));
    };
    const { preparedId } = await preparePayment(p, deps, { destination: dest, amount: "2" });
    expect((await confirmPayment(p, deps, preparedId, CLICK)).status).toBe("success");
    expect(xdrs.length).toBeGreaterThanOrEqual(2);
    expect(new Set(xdrs).size).toBe(1);
  });

  it("not included before maxTime + 15 s → TX_EXPIRED_NOT_INCLUDED", async () => {
    const { p, h, deps } = await setup();
    h.onSubmit = (xdr) => {
      const hash = Buffer.from(
        TransactionBuilder.fromXdr(xdr, NETWORKS.testnet.passphrase).hash(),
      ).toString("hex");
      h.submitScript.push(pending(hash));
    };
    const { preparedId } = await preparePayment(p, deps, { destination: dest, amount: "2" });
    const { hash } = await submitPrepared(p, deps, preparedId, CLICK);
    expect(await awaitOutcome(p, deps, hash, 20_000)).toEqual({ status: "pending", hash });
    p.advance(200_000);
    expect(await awaitOutcome(p, deps, hash, 30_000)).toMatchObject({
      status: "failed",
      error: { code: "TX_EXPIRED_NOT_INCLUDED" },
    });
  });

  it("in-flight survives lock and is resumed; reset clears it", async () => {
    const { p, h, deps } = await setup();
    h.onSubmit = (xdr) => {
      const hash = Buffer.from(
        TransactionBuilder.fromXdr(xdr, NETWORKS.testnet.passphrase).hash(),
      ).toString("hex");
      h.submitScript.push(pending(hash));
    };
    const { preparedId } = await preparePayment(p, deps, { destination: dest, amount: "2" });
    const { hash } = await submitPrepared(p, deps, preparedId, CLICK);
    await lock(p);
    expect(await listInflight(p)).toHaveLength(1);
    h.transactions.set(hash, { ...success, hash });
    expect(await resumeInflight(p, deps, 10_000)).toBe(0);
    expect((await listInflight(p))[0]).toMatchObject({
      status: "done",
      outcome: { status: "success" },
    });
    expect(JSON.stringify(await p.session.get(`inflight:${hash}`))).not.toContain('"signedXdr":"');
    await resetWallet(p, "RESET");
    expect((await p.session.keys()).filter((k) => k.startsWith("inflight:"))).toEqual([]);
  });

  it("dismissOutcome removes a finished outcome but not an unfinished one", async () => {
    const { p, h, deps } = await setup();
    h.onSubmit = (xdr) => {
      const hash = Buffer.from(
        TransactionBuilder.fromXdr(xdr, NETWORKS.testnet.passphrase).hash(),
      ).toString("hex");
      h.submitScript.push(pending(hash));
    };
    const { preparedId } = await preparePayment(p, deps, { destination: dest, amount: "2" });
    const { hash } = await submitPrepared(p, deps, preparedId, CLICK);
    expect(await codeOf(dismissOutcome(p, hash))).toBe("INVALID_REQUEST");
    h.transactions.set(hash, { ...success, hash });
    await awaitOutcome(p, deps, hash, 10_000);
    await dismissOutcome(p, hash);
    expect(await listInflight(p)).toEqual([]);
  });
});
