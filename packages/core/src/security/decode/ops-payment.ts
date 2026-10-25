import type { xdr } from "@stellar/stellar-sdk/base";
import { decodeAsset } from "./assets.js";
import type {
  AccountMergeOperation,
  CreateAccountOperation,
  PathPaymentStrictReceiveOperation,
  PathPaymentStrictSendOperation,
  PaymentOperation,
} from "./operation-types.js";
import { accountAddress, muxedAddress } from "./xdr-values.js";

// createAccount, payment, the two path payments and accountMerge.

export function decodeCreateAccount(
  op: xdr.CreateAccountOp,
  source: string | null,
): CreateAccountOperation {
  return {
    kind: "createAccount",
    opType: "createAccount",
    source,
    destination: accountAddress(op.destination),
    startingBalanceStroops: op.startingBalance,
  };
}

export function decodePayment(op: xdr.PaymentOp, source: string | null): PaymentOperation {
  return {
    kind: "payment",
    opType: "payment",
    source,
    destination: muxedAddress(op.destination),
    asset: decodeAsset(op.asset),
    amountStroops: op.amount,
  };
}

export function decodePathPaymentStrictReceive(
  op: xdr.PathPaymentStrictReceiveOp,
  source: string | null,
): PathPaymentStrictReceiveOperation {
  return {
    kind: "pathPaymentStrictReceive",
    opType: "pathPaymentStrictReceive",
    source,
    sendAsset: decodeAsset(op.sendAsset),
    sendMaxStroops: op.sendMax,
    destination: muxedAddress(op.destination),
    destAsset: decodeAsset(op.destAsset),
    destAmountStroops: op.destAmount,
    path: op.path.map(decodeAsset),
  };
}

export function decodePathPaymentStrictSend(
  op: xdr.PathPaymentStrictSendOp,
  source: string | null,
): PathPaymentStrictSendOperation {
  return {
    kind: "pathPaymentStrictSend",
    opType: "pathPaymentStrictSend",
    source,
    sendAsset: decodeAsset(op.sendAsset),
    sendAmountStroops: op.sendAmount,
    destination: muxedAddress(op.destination),
    destAsset: decodeAsset(op.destAsset),
    destMinStroops: op.destMin,
    path: op.path.map(decodeAsset),
  };
}

export function decodeAccountMerge(
  destination: xdr.MuxedAccount,
  source: string | null,
): AccountMergeOperation {
  return {
    kind: "accountMerge",
    opType: "accountMerge",
    source,
    destination: muxedAddress(destination),
  };
}
