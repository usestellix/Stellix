import type { xdr } from "@stellar/stellar-sdk/base";
import { decodeAsset, decodePrice } from "./assets.js";
import type {
  CreatePassiveSellOfferOperation,
  LiquidityPoolDepositOperation,
  LiquidityPoolWithdrawOperation,
  ManageBuyOfferOperation,
  ManageSellOfferOperation,
} from "./operation-types.js";
import { liquidityPoolAddress } from "./xdr-values.js";

// Offers and liquidity pools. Prices stay exact rationals (n/d), never floats.

export function decodeManageSellOffer(
  op: xdr.ManageSellOfferOp,
  source: string | null,
): ManageSellOfferOperation {
  return {
    kind: "manageSellOffer",
    opType: "manageSellOffer",
    source,
    selling: decodeAsset(op.selling),
    buying: decodeAsset(op.buying),
    amountStroops: op.amount,
    price: decodePrice(op.price),
    offerId: op.offerId,
  };
}

export function decodeManageBuyOffer(
  op: xdr.ManageBuyOfferOp,
  source: string | null,
): ManageBuyOfferOperation {
  return {
    kind: "manageBuyOffer",
    opType: "manageBuyOffer",
    source,
    selling: decodeAsset(op.selling),
    buying: decodeAsset(op.buying),
    buyAmountStroops: op.buyAmount,
    price: decodePrice(op.price),
    offerId: op.offerId,
  };
}

export function decodeCreatePassiveSellOffer(
  op: xdr.CreatePassiveSellOfferOp,
  source: string | null,
): CreatePassiveSellOfferOperation {
  return {
    kind: "createPassiveSellOffer",
    opType: "createPassiveSellOffer",
    source,
    selling: decodeAsset(op.selling),
    buying: decodeAsset(op.buying),
    amountStroops: op.amount,
    price: decodePrice(op.price),
  };
}

export function decodeLiquidityPoolDeposit(
  op: xdr.LiquidityPoolDepositOp,
  source: string | null,
): LiquidityPoolDepositOperation {
  return {
    kind: "liquidityPoolDeposit",
    opType: "liquidityPoolDeposit",
    source,
    liquidityPoolId: liquidityPoolAddress(op.liquidityPoolId),
    maxAmountAStroops: op.maxAmountA,
    maxAmountBStroops: op.maxAmountB,
    minPrice: decodePrice(op.minPrice),
    maxPrice: decodePrice(op.maxPrice),
  };
}

export function decodeLiquidityPoolWithdraw(
  op: xdr.LiquidityPoolWithdrawOp,
  source: string | null,
): LiquidityPoolWithdrawOperation {
  return {
    kind: "liquidityPoolWithdraw",
    opType: "liquidityPoolWithdraw",
    source,
    liquidityPoolId: liquidityPoolAddress(op.liquidityPoolId),
    amountStroops: op.amount,
    minAmountAStroops: op.minAmountA,
    minAmountBStroops: op.minAmountB,
  };
}
