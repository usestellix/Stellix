import { MuxedAccount, type Transaction } from "@stellar/stellar-sdk/base";
import { StellixError } from "../errors.js";
import { NETWORKS, type NetworkId } from "../network/config.js";
import { isMuxedAddress } from "../stellar/address.js";
import { parseXlm } from "../stellar/amount.js";

// Summary FROM THE BUILT TRANSACTION (TRANSACTIONS §3.8, SECURITY §5.1, ADR 0003): what the user
// reviews is decoded from the exact object that will be signed, never from their input.
// Anything unexpected → refuse (INTERNAL_ERROR, which the UI shows as a generic failure).

export interface PaymentSummary {
  kind: "payment" | "createAccount";
  source: string;
  destination: string;
  destinationBase: string;
  amountStroops: string;
  feeStroops: string;
  totalStroops: string;
  memo: { type: "none" | "text" | "id"; value?: string };
  network: NetworkId;
  expiresAt: number;
  firstTimeDestination: boolean;
  feeEstimated: boolean;
}

export interface SummaryContext {
  network: NetworkId;
  expectedSource: string;
  firstTimeDestination: boolean;
  feeEstimated: boolean;
}

function refuse(reason: string): never {
  throw new StellixError("INTERNAL_ERROR", `Refusing to summarize transaction: ${reason}`);
}

export function summarizeTransaction(tx: Transaction, ctx: SummaryContext): PaymentSummary {
  if (tx.networkPassphrase !== NETWORKS[ctx.network].passphrase)
    refuse("network passphrase mismatch");
  if (tx.source !== ctx.expectedSource) refuse("unexpected source account");
  if (tx.operations.length !== 1) refuse("expected exactly one operation");
  const op = tx.operations[0];
  if (op === undefined) refuse("missing operation");
  if (op.source !== undefined && op.source !== tx.source)
    refuse("operation has a different source");

  let kind: PaymentSummary["kind"];
  let destination: string;
  let amount: string;
  if (op.type === "payment") {
    if (!op.asset.isNative()) refuse("non-native asset");
    kind = "payment";
    destination = op.destination;
    amount = op.amount;
  } else if (op.type === "createAccount") {
    kind = "createAccount";
    destination = op.destination;
    amount = op.startingBalance;
  } else {
    refuse(`operation type ${op.type} not allowed`);
  }

  const amountStroops = parseXlm(amount);
  const feeStroops = BigInt(tx.fee);
  const maxTime = tx.timeBounds?.maxTime;
  if (maxTime === undefined || maxTime === "0") refuse("missing timebounds");

  const memo = tx.memo;
  let memoSummary: PaymentSummary["memo"];
  if (memo.type === "none") memoSummary = { type: "none" };
  else if (memo.type === "text") {
    const value = memo.value;
    memoSummary = {
      type: "text",
      value: typeof value === "string" ? value : new TextDecoder().decode(value as Uint8Array),
    };
  } else if (memo.type === "id") memoSummary = { type: "id", value: String(memo.value) };
  else refuse(`memo type ${memo.type} not allowed`);

  const destinationBase = isMuxedAddress(destination)
    ? MuxedAccount.fromAddress(destination, "0").baseAccount().accountId()
    : destination;
  if (kind === "createAccount" && destinationBase !== destination)
    refuse("createAccount to a muxed address");

  return {
    kind,
    source: tx.source,
    destination,
    destinationBase,
    amountStroops: amountStroops.toString(),
    feeStroops: feeStroops.toString(),
    totalStroops: (amountStroops + feeStroops).toString(),
    memo: memoSummary,
    network: ctx.network,
    expiresAt: Number(maxTime) * 1000,
    firstTimeDestination: ctx.firstTimeDestination,
    feeEstimated: ctx.feeEstimated,
  };
}

/** Defence in depth at confirm time: the rehydrated tx must summarize to the stored summary. */
export function assertSameSummary(a: PaymentSummary, b: PaymentSummary): void {
  if (JSON.stringify(a) !== JSON.stringify(b))
    refuse("prepared transaction no longer matches its summary");
}
