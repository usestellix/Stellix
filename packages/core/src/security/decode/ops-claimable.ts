import type { xdr } from "@stellar/stellar-sdk/base";
import { assertNever } from "../../assert-never.js";
import { decodeAsset } from "./assets.js";
import type {
  ClaimClaimableBalanceOperation,
  CreateClaimableBalanceOperation,
  DecodedClaimPredicate,
} from "./operation-types.js";
import { accountAddress, claimableBalanceAddress, invalidInput } from "./xdr-values.js";

// createClaimableBalance and claimClaimableBalance (CAP-23).

/** stellar-core's validatePredicate limit; also bounds our recursion. */
const MAX_PREDICATE_DEPTH = 4;

function pair(
  predicates: readonly xdr.ClaimPredicate[],
  depth: number,
): readonly [DecodedClaimPredicate, DecodedClaimPredicate] {
  const [a, b] = predicates;
  if (predicates.length !== 2 || a === undefined || b === undefined) {
    throw invalidInput("Invalid claim predicate");
  }
  return [decodePredicate(a, depth + 1), decodePredicate(b, depth + 1)];
}

/** Rejects what stellar-core's validatePredicate rejects, so the network and we agree. */
export function decodePredicate(p: xdr.ClaimPredicate, depth = 1): DecodedClaimPredicate {
  if (depth > MAX_PREDICATE_DEPTH) throw invalidInput("Claim predicate nested too deeply");
  switch (p.type) {
    case "claimPredicateUnconditional":
      return { type: "unconditional" };
    case "claimPredicateAnd":
      return { type: "and", predicates: pair(p.andPredicates, depth) };
    case "claimPredicateOr":
      return { type: "or", predicates: pair(p.orPredicates, depth) };
    case "claimPredicateNot":
      if (p.notPredicate === null) throw invalidInput("Invalid claim predicate");
      return { type: "not", predicate: decodePredicate(p.notPredicate, depth + 1) };
    case "claimPredicateBeforeAbsoluteTime":
      if (p.absBefore < 0n) throw invalidInput("Invalid claim predicate");
      return { type: "beforeAbsoluteTime", epochSeconds: p.absBefore };
    case "claimPredicateBeforeRelativeTime":
      if (p.relBefore < 0n) throw invalidInput("Invalid claim predicate");
      return { type: "beforeRelativeTime", seconds: p.relBefore };
    default:
      return assertNever(p);
  }
}

export function decodeCreateClaimableBalance(
  op: xdr.CreateClaimableBalanceOp,
  source: string | null,
): CreateClaimableBalanceOperation {
  return {
    kind: "createClaimableBalance",
    opType: "createClaimableBalance",
    source,
    asset: decodeAsset(op.asset),
    amountStroops: op.amount,
    claimants: op.claimants.map((c) => ({
      destination: accountAddress(c.v0.destination),
      predicate: decodePredicate(c.v0.predicate),
    })),
  };
}

export function decodeClaimClaimableBalance(
  op: xdr.ClaimClaimableBalanceOp,
  source: string | null,
): ClaimClaimableBalanceOperation {
  return {
    kind: "claimClaimableBalance",
    opType: "claimClaimableBalance",
    source,
    balanceId: claimableBalanceAddress(op.balanceId),
  };
}
