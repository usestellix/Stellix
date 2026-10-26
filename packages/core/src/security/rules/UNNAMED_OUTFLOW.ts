import { extractBaseAddress } from "@stellar/stellar-sdk/base";
import type { DecodedAsset } from "../decode/value-types.js";
import { resolveSources } from "../decode/sources.js";
import type { DecodedRequest, Finding, Rule } from "../types.js";
import { formatAssetWithIssuer, formatStroops } from "./format.js";

/**
 * Something that can leave the user's account, from an op whose effective source is the user.
 * `to` outflows go to a named address; `market` ones (offers, pool deposits) to whoever trades
 * with them, so they're listed for the review screen but never compared with what was presented.
 */
export type Outflow =
  | {
      kind: "to";
      opIndex: number;
      opType: string;
      /** G… or M…, exactly as the op names it. */
      to: string;
      /** null for a merge: the account's whole XLM balance. */
      asset: DecodedAsset | null;
      amountStroops: bigint | null;
      /** "max": a path payment's sendMax; the op may send less. */
      bound: "exact" | "max";
    }
  | { kind: "market"; opIndex: number; opType: string; asset: DecodedAsset | null };

function base(address: string): string {
  return address.startsWith("M") ? extractBaseAddress(address) : address;
}

/** Every outflow from the user, in op order. Payments to the user's own account are skipped. */
export function listOutflows(decoded: DecodedRequest, userAccount: string): Outflow[] {
  const user = base(userAccount);
  const sources = resolveSources(decoded, userAccount);
  const out: Outflow[] = [];
  const to = (
    opIndex: number,
    opType: string,
    address: string,
    asset: DecodedAsset | null,
    amountStroops: bigint | null,
    bound: "exact" | "max" = "exact",
  ) => {
    if (base(address) !== user)
      out.push({ kind: "to", opIndex, opType, to: address, asset, amountStroops, bound });
  };
  decoded.operations.forEach((op, opIndex) => {
    if (sources.ops[opIndex]?.isUser !== true) return;
    switch (op.kind) {
      case "createAccount":
        to(opIndex, op.opType, op.destination, { type: "native" }, op.startingBalanceStroops);
        break;
      case "payment":
        to(opIndex, op.opType, op.destination, op.asset, op.amountStroops);
        break;
      case "pathPaymentStrictSend":
        to(opIndex, op.opType, op.destination, op.sendAsset, op.sendAmountStroops);
        break;
      case "pathPaymentStrictReceive":
        to(opIndex, op.opType, op.destination, op.sendAsset, op.sendMaxStroops, "max");
        break;
      case "accountMerge":
        to(opIndex, op.opType, op.destination, null, null);
        break;
      case "createClaimableBalance":
        // Every claimant other than the user could take it.
        for (const c of op.claimants)
          to(opIndex, op.opType, c.destination, op.asset, op.amountStroops);
        break;
      case "manageSellOffer":
      case "manageBuyOffer":
      case "createPassiveSellOffer":
        out.push({ kind: "market", opIndex, opType: op.opType, asset: op.selling });
        break;
      case "liquidityPoolDeposit":
        out.push({ kind: "market", opIndex, opType: op.opType, asset: null });
        break;
      default:
        break;
    }
  });
  return out;
}

function amountText(o: Extract<Outflow, { kind: "to" }>): string {
  if (o.asset === null || o.amountStroops === null) return "the account's whole XLM balance";
  const amount = `${formatStroops(o.amountStroops)} ${formatAssetWithIssuer(o.asset)}`;
  return o.bound === "max" ? `up to ${amount}` : amount;
}

/**
 * UNNAMED_OUTFLOW (SHIELD §6.1, #28): an asset leaves the user for an address the requester
 * didn't present (`request.presented`, exact address match). Mode A presents the Send form's
 * destination; Mode C presents nothing, so every outflow to another account is listed as a
 * finding. Offers and pool deposits are `market` outflows: listed, never flagged here
 * (OFFER_BAD_PRICE judges offers).
 */
export const UNNAMED_OUTFLOW: Rule = {
  id: "UNNAMED_OUTFLOW",
  evaluate(ctx) {
    if (ctx.request.kind !== "transaction") return [];
    const presented = new Set(ctx.request.presented.destinations);
    const findings: Finding[] = [];
    for (const o of listOutflows(ctx.decoded, ctx.userAccount)) {
      if (o.kind !== "to" || presented.has(o.to)) continue;
      findings.push({
        ruleId: "UNNAMED_OUTFLOW",
        severity: "high",
        confidence: "high",
        opIndex: o.opIndex,
        evidence: {
          opNumber: String(o.opIndex + 1),
          opType: o.opType,
          destination: o.to,
          amount: amountText(o),
        },
      });
    }
    return findings;
  },
};
