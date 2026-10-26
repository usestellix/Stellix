import {
  Account,
  Asset,
  Networks,
  Operation,
  TransactionBuilder,
  type xdr,
} from "@stellar/stellar-sdk/base";
import { accountSchema, type AccountRecord } from "../../network/horizon-schemas.js";
import { FakeHorizonClient } from "../../testing/fake-horizon.js";
import { analyze } from "../index.js";
import type { Origin, ShieldDeps } from "../types.js";

// Transactions built with the SDK for rule tests, for the shapes testnet fixtures don't have
// (a signer add hidden among payments, a user-sourced op in someone else's transaction, …).
// The addresses are the capture script's fixture accounts.

export const USER = "GB2UTPVMBMQSS64UB74V3AQVQAQWNQ225NIWCIKJ3B4XNSJB5NQJFJLJ";
export const PEER = "GDX3XHNB6XNJBRMOWOP4ZQVKL5CFMXD4MJFXFICFVGR7J2KQXMDIANZD";
export const OTHER = "GBVUE57PFI4Z37X2R6X2IKKQ2BIQCKFFARLG2SWIBK22CKPARHUAEFEM";
/** The user's account muxed with ID 1. */
export const USER_MUXED = "MB2UTPVMBMQSS64UB74V3AQVQAQWNQ225NIWCIKJ3B4XNSJB5NQJEAAAAAAAAAAAAH73U";

export const NOW = Date.parse("2026-10-25T11:00:00Z");
const NOW_S = NOW / 1000;

export interface TxOptions {
  source?: string;
  feeStroops?: string;
  /** Seconds after NOW; null leaves maxTime at 0 (no upper bound). Default 180. */
  validForSeconds?: number | null;
}

export function buildTx(ops: readonly xdr.Operation[], opts: TxOptions = {}): string {
  const valid = opts.validForSeconds === undefined ? 180 : opts.validForSeconds;
  const builder = new TransactionBuilder(new Account(opts.source ?? USER, "1"), {
    fee: opts.feeStroops ?? "100",
    networkPassphrase: Networks.TESTNET,
    timebounds: { minTime: 0, maxTime: valid === null ? 0 : NOW_S + valid },
  });
  for (const op of ops) builder.addOperation(op);
  return builder.build().toEnvelope().toXdr("base64");
}

export const pay = (destination = PEER, source?: string) =>
  Operation.payment({
    destination,
    asset: Asset.native(),
    amount: "1",
    ...(source === undefined ? {} : { source }),
  });

/** An account record as Horizon would serve it, for the fake client. */
export function accountRecord(
  id: string,
  opts: { masterWeight?: number; low?: number; med?: number; high?: number } = {},
): AccountRecord {
  return accountSchema.parse({
    id,
    sequence: "1",
    subentry_count: 0,
    thresholds: {
      low_threshold: opts.low ?? 0,
      med_threshold: opts.med ?? 0,
      high_threshold: opts.high ?? 0,
    },
    signers: [{ key: id, weight: opts.masterWeight ?? 1, type: "ed25519_public_key" }],
    balances: [
      {
        asset_type: "native",
        balance: "100.0000000",
        selling_liabilities: "0.0000000",
        buying_liabilities: "0.0000000",
      },
    ],
    data: {},
  });
}

export interface AnalyzeOptions {
  userAccount?: string;
  origin?: Origin;
  horizon?: FakeHorizonClient;
}

export function analyzeTx(xdrBase64: string, opts: AnalyzeOptions = {}) {
  const deps: ShieldDeps = {
    horizon: opts.horizon ?? new FakeHorizonClient(),
    toml: { fetchToml: () => Promise.reject(new Error("no toml in this test")) },
    userAccount: opts.userAccount ?? USER,
    now: () => NOW,
  };
  return analyze(
    {
      kind: "transaction",
      xdr: xdrBase64,
      network: "testnet",
      origin: opts.origin ?? { type: "pasted" },
    },
    deps,
  );
}
