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
