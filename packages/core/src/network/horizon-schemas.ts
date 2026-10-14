import { z } from "zod";

// Horizon response schemas (NETWORK.md §4). Each covers only the fields Stellix uses and is
// loose (passes extra fields through), so new Horizon fields never break us. Shapes verified
// against live testnet Horizon v29 on 2026-10-14; fixtures in __fixtures__/horizon/.

const int64String = z.string().regex(/^-?\d+$/);
const amountString = z.string().regex(/^\d+\.\d{7}$/);

export const rootSchema = z.looseObject({
  network_passphrase: z.string(),
  horizon_version: z.string(),
  current_protocol_version: z.number().int(),
  history_latest_ledger: z.number().int(),
});
export type HorizonRoot = z.output<typeof rootSchema>;

export const ledgerSchema = z.looseObject({
  sequence: z.number().int(),
  base_reserve_in_stroops: z.number().int().positive(),
  base_fee_in_stroops: z.number().int().positive(),
  closed_at: z.string(),
});
export type LedgerRecord = z.output<typeof ledgerSchema>;

export const ledgerPageSchema = z.looseObject({
  _embedded: z.looseObject({ records: z.array(ledgerSchema).min(1) }),
});

const nativeBalanceSchema = z.looseObject({
  asset_type: z.literal("native"),
  balance: amountString,
  selling_liabilities: amountString,
  buying_liabilities: amountString,
});

/**
 * Non-native balances are passed through untouched and ignored in the MVP. `native` is excluded:
 * a malformed native balance must fail validation, not slip through as an "other" asset.
 */
const otherBalanceSchema = z.looseObject({
  asset_type: z.string().refine((t) => t !== "native"),
});

export const accountSchema = z.looseObject({
  id: z.string(),
  sequence: int64String,
  subentry_count: z.number().int().nonnegative(),
  num_sponsoring: z.number().int().nonnegative().optional(),
  num_sponsored: z.number().int().nonnegative().optional(),
  thresholds: z.looseObject({
    low_threshold: z.number().int(),
    med_threshold: z.number().int(),
    high_threshold: z.number().int(),
  }),
  signers: z.array(z.looseObject({ key: z.string(), weight: z.number().int(), type: z.string() })),
  balances: z.array(z.union([nativeBalanceSchema, otherBalanceSchema])),
  data: z.record(z.string(), z.string()),
});
export type AccountRecord = z.output<typeof accountSchema>;
export type NativeBalance = z.output<typeof nativeBalanceSchema>;

const percentiles = z.looseObject({
  max: int64String,
  min: int64String,
  mode: int64String,
  p10: int64String,
  p50: int64String,
  p70: int64String,
  p90: int64String,
  p99: int64String,
});

export const feeStatsSchema = z.looseObject({
  last_ledger_base_fee: int64String,
  ledger_capacity_usage: z.string(),
  fee_charged: percentiles,
  max_fee: percentiles,
});
export type FeeStats = z.output<typeof feeStatsSchema>;

/** RFC 7807 problem document Horizon and Friendbot return on errors. */
export const problemSchema = z.looseObject({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
});

export function nativeBalanceOf(account: AccountRecord): NativeBalance | null {
  for (const b of account.balances) {
    const parsed = nativeBalanceSchema.safeParse(b);
    if (parsed.success) return parsed.data;
  }
  return null;
}

/** POST /transactions_async (ADR 0007). */
export const ASYNC_TX_STATUSES = ["PENDING", "DUPLICATE", "TRY_AGAIN_LATER", "ERROR"] as const;
export type AsyncTxStatus = (typeof ASYNC_TX_STATUSES)[number];

export const asyncSubmitSchema = z.looseObject({
  tx_status: z.enum(ASYNC_TX_STATUSES),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  error_result_xdr: z.string().optional(),
});
export type AsyncSubmitResponse = z.output<typeof asyncSubmitSchema>;

/** GET /transactions/{hash} */
export const transactionSchema = z.looseObject({
  hash: z.string(),
  successful: z.boolean(),
  ledger: z.number().int(),
  result_xdr: z.string(),
  created_at: z.string(),
});
export type TransactionRecord = z.output<typeof transactionSchema>;

/** GET /accounts/{id}/payments: only the counterparty fields firstTimeDestination needs. */
const paymentRecordSchema = z.looseObject({
  id: z.string(),
  type: z.string(),
  transaction_hash: z.string(),
  created_at: z.string(),
  from: z.string().optional(),
  to: z.string().optional(),
  account: z.string().optional(),
  funder: z.string().optional(),
  into: z.string().optional(),
});
export type PaymentRecord = z.output<typeof paymentRecordSchema>;

export const paymentsPageSchema = z.looseObject({
  _embedded: z.looseObject({ records: z.array(paymentRecordSchema) }),
});

/** The transaction embedded by `join=transactions` (NETWORK §5): memo and fee attribution. */
const joinedTransactionSchema = z.looseObject({
  memo_type: z.string(),
  memo: z.string().optional(),
  fee_account: z.string(),
  fee_charged: int64String,
  operation_count: z.number().int().positive(),
});

/**
 * GET /accounts/{id}/payments?join=transactions (history). Payment-like records only: payment,
 * path payments, create_account, account_merge. Fields vary by type, so all are optional and
 * normalization decides what a record means.
 */
export const historyRecordSchema = paymentRecordSchema.extend({
  // Numeric: ids order the merged list (normalize.ts).
  id: z.string().regex(/^\d+$/),
  paging_token: z.string().regex(/^\d+$/),
  transaction_successful: z.boolean(),
  from_muxed: z.string().optional(),
  from_muxed_id: z.string().optional(),
  to_muxed: z.string().optional(),
  to_muxed_id: z.string().optional(),
  asset_type: z.string().optional(),
  amount: amountString.optional(),
  source_asset_type: z.string().optional(),
  source_amount: amountString.optional(),
  starting_balance: amountString.optional(),
  transaction: joinedTransactionSchema,
});
export type HistoryRecord = z.output<typeof historyRecordSchema>;

export const historyPageSchema = z.looseObject({
  _embedded: z.looseObject({ records: z.array(historyRecordSchema) }),
});

/** GET /operations/{id}/effects: only what merge amounts need. */
const effectSchema = z.looseObject({
  type: z.string(),
  account: z.string().optional(),
  amount: amountString.optional(),
});
export type EffectRecord = z.output<typeof effectSchema>;

export const effectsPageSchema = z.looseObject({
  _embedded: z.looseObject({ records: z.array(effectSchema) }),
});
