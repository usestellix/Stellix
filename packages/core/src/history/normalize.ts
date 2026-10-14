import { MuxedAccount } from "@stellar/stellar-sdk/base";
import type { EffectRecord, HistoryRecord } from "../network/horizon-schemas.js";
import { isMuxedAddress } from "../stellar/address.js";
import { parseHorizonAmount } from "../stellar/amount.js";

// History normalization (NETWORK §5): Horizon payment-like records → UI-ready items, XLM only.
// Directions compare BASE accounts: Horizon reports `from`/`to` as G addresses and adds
// `from_muxed`/`to_muxed` when an M address was used.

export interface HistoryItem {
  /** Operation id. */
  id: string;
  pagingToken: string;
  hash: string;
  /** ISO time. */
  at: string;
  direction: "in" | "out" | "self";
  kind: "payment" | "account_created" | "account_merged";
  /** The other side, G or M as used on chain; our own address for "self". */
  counterparty: string;
  /** Null for a merge until its effects are read (mergeAmountFromEffects). */
  amountStroops: string | null;
  memo?: { type: "text" | "id" | "hash" | "return"; value: string };
  /** The recipient ID when an incoming payment was sent to our M address. */
  muxedId?: string;
  successful: boolean;
  /**
   * The whole transaction's fee, present only when THIS account paid it (fee_account === me).
   * Shown in the detail sheet only: on a multi-op transaction it covers every operation, so
   * putting it on each row would overstate what was paid.
   */
  fee?: { stroops: string; operationCount: number };
}

const MEMO_TYPES = {
  text: "text",
  id: "id",
  hash: "hash",
  return: "return",
} as const satisfies Record<string, NonNullable<HistoryItem["memo"]>["type"]>;

function baseOf(address: string | undefined): string | undefined {
  return address !== undefined && isMuxedAddress(address)
    ? MuxedAccount.fromAddress(address, "0").baseAccount().accountId()
    : address;
}

const isNative = (assetType: string | undefined) => assetType === "native";

interface Classified {
  direction: HistoryItem["direction"];
  kind: HistoryItem["kind"];
  counterparty: string;
  amount: string | null;
  muxedId?: string | undefined;
}

function classify(r: HistoryRecord, me: string): Classified | null {
  const from = baseOf(r.from);
  const to = baseOf(r.to);
  switch (r.type) {
    case "payment": {
      if (!isNative(r.asset_type) || r.amount === undefined) return null;
      if (from === me && to === me) return self(r.amount);
      if (from === me && r.to !== undefined)
        return {
          direction: "out",
          kind: "payment",
          counterparty: r.to_muxed ?? r.to,
          amount: r.amount,
        };
      if (to === me && r.from !== undefined)
        return {
          direction: "in",
          kind: "payment",
          counterparty: r.from_muxed ?? r.from,
          amount: r.amount,
          muxedId: r.to_muxed_id,
        };
      return null;
    }
    case "path_payment_strict_send":
    case "path_payment_strict_receive": {
      // Shown only when XLM moved on OUR side: what we paid, or what we received.
      if (from === me && to === me) {
        return isNative(r.source_asset_type) && isNative(r.asset_type) && r.amount !== undefined
          ? self(r.amount)
          : null;
      }
      if (from === me && r.to !== undefined) {
        return isNative(r.source_asset_type) && r.source_amount !== undefined
          ? {
              direction: "out",
              kind: "payment",
              counterparty: r.to_muxed ?? r.to,
              amount: r.source_amount,
            }
          : null;
      }
      if (to === me && r.from !== undefined) {
        return isNative(r.asset_type) && r.amount !== undefined
          ? {
              direction: "in",
              kind: "payment",
              counterparty: r.from_muxed ?? r.from,
              amount: r.amount,
              muxedId: r.to_muxed_id,
            }
          : null;
      }
      return null;
    }
    case "create_account": {
      if (r.starting_balance === undefined || r.account === undefined || r.funder === undefined)
        return null;
      if (r.account === me)
        return {
          direction: "in",
          kind: "account_created",
          counterparty: r.funder,
          amount: r.starting_balance,
        };
      if (baseOf(r.funder) === me)
        return {
          direction: "out",
          kind: "account_created",
          counterparty: r.account,
          amount: r.starting_balance,
        };
      return null;
    }
    case "account_merge": {
      if (r.account === undefined || r.into === undefined) return null;
      if (baseOf(r.into) === me)
        return { direction: "in", kind: "account_merged", counterparty: r.account, amount: null };
      if (baseOf(r.account) === me)
        return { direction: "out", kind: "account_merged", counterparty: r.into, amount: null };
      return null;
    }
    default:
      return null;
  }

  function self(amount: string): Classified {
    return { direction: "self", kind: "payment", counterparty: me, amount };
  }
}

/**
 * One record → one item, or null when the MVP doesn't show it (non-XLM assets, path payments
 * that don't move XLM on our side, other operation types). Throws HORIZON_BAD_RESPONSE on a
 * malformed amount.
 */
export function normalizeHistoryRecord(record: HistoryRecord, me: string): HistoryItem | null {
  const c = classify(record, me);
  if (c === null) return null;
  const tx = record.transaction;
  const memoType = MEMO_TYPES[tx.memo_type as keyof typeof MEMO_TYPES] as
    NonNullable<HistoryItem["memo"]>["type"] | undefined;
  return {
    id: record.id,
    pagingToken: record.paging_token,
    hash: record.transaction_hash,
    at: record.created_at,
    direction: c.direction,
    kind: c.kind,
    counterparty: c.counterparty,
    amountStroops: c.amount === null ? null : parseHorizonAmount(c.amount).toString(),
    ...(memoType !== undefined && tx.memo !== undefined
      ? { memo: { type: memoType, value: tx.memo } }
      : {}),
    ...(c.muxedId !== undefined ? { muxedId: c.muxedId } : {}),
    successful: record.transaction_successful,
    ...(baseOf(tx.fee_account) === me
      ? { fee: { stroops: BigInt(tx.fee_charged).toString(), operationCount: tx.operation_count } }
      : {}),
  };
}

export function normalizeHistory(records: readonly HistoryRecord[], me: string): HistoryItem[] {
  return records.flatMap((r) => {
    const item = normalizeHistoryRecord(r, me);
    return item === null ? [] : [item];
  });
}

/** A merge's amount from its effects: what we were credited ("in") or debited ("out"). */
export function mergeAmountFromEffects(
  effects: readonly EffectRecord[],
  me: string,
  direction: HistoryItem["direction"],
): string | null {
  const wanted = direction === "in" ? "account_credited" : "account_debited";
  const effect = effects.find((e) => e.type === wanted && e.account === me);
  return effect?.amount === undefined ? null : parseHorizonAmount(effect.amount).toString();
}

/**
 * Merges a fresh page (or streamed items) into a list by operation id, newest first. Fresh items
 * win, so a refetch updates what a cache showed.
 */
export function mergeHistoryItems(
  current: readonly HistoryItem[],
  fresh: readonly HistoryItem[],
): HistoryItem[] {
  const byId = new Map(current.map((i) => [i.id, i]));
  for (const item of fresh) {
    const old = byId.get(item.id);
    // Keep a merge amount the user already loaded; Horizon never sends it on the record.
    byId.set(
      item.id,
      old !== undefined && item.amountStroops === null
        ? { ...item, amountStroops: old.amountStroops }
        : item,
    );
  }
  // Operation ids (= paging tokens for payments) are int64 and increase with ledger order.
  return [...byId.values()].sort((a, b) => {
    const x = BigInt(a.id);
    const y = BigInt(b.id);
    return x === y ? 0 : x > y ? -1 : 1;
  });
}

/** True when this item is the account's very first operation (UI end-of-list copy). */
export function isAccountOrigin(item: HistoryItem): boolean {
  return item.kind === "account_created" && item.direction === "in";
}
