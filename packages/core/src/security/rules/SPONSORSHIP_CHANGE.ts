import { extractBaseAddress } from "@stellar/stellar-sdk/base";
import type { DecodedOperation } from "../decode/operation-types.js";
import type { SponsoredEntry } from "../decode/value-types.js";
import { resolveSources } from "../decode/sources.js";
import { isUnavailable } from "../lookups.js";
import type { DecodedRequest, Finding, Rule } from "../types.js";
import { formatAssetWithIssuer, formatStroops } from "./format.js";

// Sponsorship (CAP-33): between beginSponsoringFutureReserves(S) by P and S's matching
// endSponsoringFutureReserves, P pays the reserves of entries S creates. revokeSponsorship moves
// an entry's reserve from its sponsor to the sponsor of the revoking account's sandwich, or
// back to the entry's owner. Shared with the gather step, which reads the base reserve only
// when a change affects the user.

const base = (address: string) => (address.startsWith("M") ? extractBaseAddress(address) : address);

export interface SponsorshipChange {
  opIndex: number;
  /** What the reserve is for, in words with full addresses. */
  entry: string;
  /** Base reserves that change payer: account 2, a claimable balance 1 per claimant, others 1. */
  reserveEntries: bigint;
  /** G… that pays the reserve after the op. */
  payer: string;
}

/** Reserve units S creates in its sandwich from `from` (exclusive) to its end. */
function sandwichEntries(
  ops: readonly DecodedOperation[],
  opAccounts: readonly string[],
  from: number,
  sponsored: string,
): bigint {
  let units = 0n;
  for (let i = from + 1; i < ops.length; i++) {
    const op = ops[i];
    if (op === undefined) break;
    const bySponsored = opAccounts[i] === sponsored;
    if (op.kind === "endSponsoringFutureReserves" && bySponsored) break;
    if (op.kind === "createAccount" && base(op.destination) === sponsored) units += 2n;
    if (!bySponsored) continue;
    if (op.kind === "changeTrust" && op.limitStroops > 0n) units += 1n;
    if (op.kind === "manageData" && op.dataValue !== null) units += 1n;
    if (op.kind === "setOptions" && op.signer !== null && op.signer.weight > 0) units += 1n;
    if (op.kind === "manageSellOffer" && op.offerId === 0n && op.amountStroops > 0n) units += 1n;
    if (op.kind === "manageBuyOffer" && op.offerId === 0n && op.buyAmountStroops > 0n) units += 1n;
    if (op.kind === "createPassiveSellOffer") units += 1n;
    if (op.kind === "createClaimableBalance") units += BigInt(op.claimants.length);
  }
  return units;
}

function entryOwner(entry: SponsoredEntry): string | null {
  switch (entry.type) {
    case "account":
    case "trustline":
    case "data":
    case "signer":
      return entry.accountId;
    case "offer":
      return entry.sellerId;
    case "claimableBalance":
    case "liquidityPool":
      return null;
  }
}

function entryText(entry: SponsoredEntry): string {
  switch (entry.type) {
    case "account":
      return `the account ${entry.accountId}`;
    case "trustline":
      return entry.asset.type === "poolShare"
        ? `the pool-share trustline ${entry.asset.liquidityPoolId} of ${entry.accountId}`
        : `the ${formatAssetWithIssuer(entry.asset)} trustline of ${entry.accountId}`;
    case "offer":
      return `offer ${entry.offerId.toString()} of ${entry.sellerId}`;
    case "data":
      return `the data entry "${entry.dataName.text ?? `0x${entry.dataName.hex}`}" of ${entry.accountId}`;
    case "signer":
      return `the signer ${entry.signerKey.key} on ${entry.accountId}`;
    case "claimableBalance":
      return `the claimable balance ${entry.balanceId}`;
    case "liquidityPool":
      return `the liquidity pool ${entry.liquidityPoolId}`;
  }
}

/** Each begin or revoke that affects the user's reserves, in op order. */
export function sponsorshipChanges(
  decoded: DecodedRequest,
  userAccount: string,
): SponsorshipChange[] {
  const user = base(userAccount);
  const sources = resolveSources(decoded, userAccount);
  const opAccounts = sources.ops.map((s) => s.account);
  /** sponsored account → its current sandwich's sponsor */
  const sandwich = new Map<string, string>();
  const out: SponsorshipChange[] = [];
  decoded.operations.forEach((op, opIndex) => {
    const source = opAccounts[opIndex];
    if (source === undefined) return;
    if (op.kind === "beginSponsoringFutureReserves") {
      sandwich.set(op.sponsoredId, source);
      if (source !== user && op.sponsoredId !== user) return;
      const units = sandwichEntries(decoded.operations, opAccounts, opIndex, op.sponsoredId);
      // A sandwich that creates nothing affects no entry; a revoke inside it is reported itself.
      if (units === 0n) return;
      out.push({
        opIndex,
        entry: `new entries of ${op.sponsoredId}`,
        reserveEntries: units,
        payer: source,
      });
    } else if (op.kind === "endSponsoringFutureReserves") {
      sandwich.delete(source);
    } else if (op.kind === "revokeSponsorship") {
      const owner = entryOwner(op.entry);
      if (source !== user && owner !== user) return;
      out.push({
        opIndex,
        entry: entryText(op.entry),
        // A claimable balance holds 1 per claimant, which the op doesn't say: at least 1.
        reserveEntries: op.entry.type === "account" ? 2n : 1n,
        // The revoking account's sandwich sponsor takes it over; else the owner pays. With
        // neither (a claimable balance can't be unsponsored) the network rejects the op.
        payer: sandwich.get(source) ?? owner ?? source,
      });
    }
  });
  return out;
}

/**
 * SPONSORSHIP_CHANGE (SHIELD §6.1, #32): a begin or revoke sponsorship that affects the user's
 * reserves, either as sponsor or as owner, with the reserve that changes payer in the evidence:
 * reserve units × the base reserve from the latest ledger. Without the base reserve the check
 * is unavailable, never passed.
 */
export const SPONSORSHIP_CHANGE: Rule = {
  id: "SPONSORSHIP_CHANGE",
  evaluate(ctx) {
    const changes = sponsorshipChanges(ctx.decoded, ctx.userAccount);
    if (changes.length === 0) return [];
    const baseReserve = ctx.data.baseReserveStroops;
    if (baseReserve === undefined) return { unavailable: true, reason: "internal" };
    if (isUnavailable(baseReserve)) return baseReserve;
    const user = base(ctx.userAccount);
    return changes.map((c): Finding => ({
      ruleId: "SPONSORSHIP_CHANGE",
      severity: "medium",
      confidence: "high",
      opIndex: c.opIndex,
      evidence: {
        opNumber: String(c.opIndex + 1),
        entry: c.entry,
        reserveEntries: c.reserveEntries.toString(),
        reserveAmount: formatStroops(c.reserveEntries * baseReserve),
        reserveStroops: (c.reserveEntries * baseReserve).toString(),
        payer: c.payer === user ? `your account ${c.payer}` : c.payer,
      },
    }));
  },
};
