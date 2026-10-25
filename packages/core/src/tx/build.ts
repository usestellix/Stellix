import {
  Account,
  Asset,
  Memo,
  Operation,
  TransactionBuilder,
  type FeeBumpTransaction,
  type Transaction,
} from "@stellar/stellar-sdk/base";
import { formatXlm } from "../stellar/amount.js";
import type { PaymentKind } from "./select-op.js";
import type { MemoSpec } from "./validate.js";

// Build (TRANSACTIONS §3.7). Every transaction has timebounds (CLAUDE.md §6.10).

export const TX_TIMEOUT_SECONDS = 180;

export interface BuildPaymentParams {
  sourceId: string;
  /** From a freshly loaded account (STELLAR_PRIMER §5.1). The builder uses sequence + 1. */
  sourceSequence: string;
  kind: PaymentKind;
  destination: string;
  amountStroops: bigint;
  memo: MemoSpec;
  feeStroops: bigint;
  networkPassphrase: string;
}

export function buildPaymentTransaction(p: BuildPaymentParams): Transaction {
  const amount = formatXlm(p.amountStroops); // exactly 7 decimals, as the SDK expects
  const op =
    p.kind === "payment"
      ? Operation.payment({ destination: p.destination, asset: Asset.native(), amount })
      : Operation.createAccount({ destination: p.destination, startingBalance: amount });
  const memo =
    p.memo.type === "text"
      ? Memo.text(p.memo.value)
      : p.memo.type === "id"
        ? Memo.id(p.memo.value)
        : Memo.none();
  return new TransactionBuilder(new Account(p.sourceId, p.sourceSequence), {
    fee: p.feeStroops.toString(),
    networkPassphrase: p.networkPassphrase,
  })
    .addOperation(op)
    .addMemo(memo)
    .setTimeout(TX_TIMEOUT_SECONDS)
    .build();
}

export function rehydrateTransaction(xdrBase64: string, networkPassphrase: string): Transaction {
  const tx = TransactionBuilder.fromXdr(xdrBase64, networkPassphrase);
  if (!("operations" in tx) || "innerTransaction" in tx) {
    throw new Error("not a plain transaction");
  }
  return tx;
}

export function transactionHashHex(tx: Transaction | FeeBumpTransaction): string {
  return Array.from(tx.hash(), (b) => b.toString(16).padStart(2, "0")).join("");
}
