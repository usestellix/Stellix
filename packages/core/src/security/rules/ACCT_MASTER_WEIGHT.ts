import { resolveSources } from "../decode/sources.js";
import type { SetOptionsOperation } from "../decode/operation-types.js";
import { isUnavailable } from "../lookups.js";
import type { DecodedRequest, Rule } from "../types.js";

// Shared with the gather step: the user's account is only fetched when this rule needs it, so
// a transaction without such a setOptions never depends on Horizon for this check.

interface KeyState {
  masterWeight: number;
  low: number;
  med: number;
  high: number;
}

export interface CheckedMasterKeyOp {
  opIndex: number;
  op: SetOptionsOperation;
}

/** User-sourced setOptions ops that set the master weight or a threshold, in op order. */
export function checkedMasterKeyOps(
  decoded: DecodedRequest,
  userAccount: string,
): CheckedMasterKeyOp[] {
  const sources = resolveSources(decoded, userAccount);
  const out: CheckedMasterKeyOp[] = [];
  decoded.operations.forEach((op, opIndex) => {
    if (op.kind !== "setOptions" || sources.ops[opIndex]?.isUser !== true) return;
    const touches =
      op.masterWeight !== null ||
      op.lowThreshold !== null ||
      op.medThreshold !== null ||
      op.highThreshold !== null;
    if (touches) out.push({ opIndex, op });
  });
  return out;
}

/** The master key alone can authorize every operation: weight > 0 and ≥ every threshold. */
function masterAuthorizesAll(s: KeyState): boolean {
  return s.masterWeight > 0 && s.masterWeight >= Math.max(s.low, s.med, s.high);
}

function apply(s: KeyState, op: SetOptionsOperation): KeyState {
  return {
    masterWeight: op.masterWeight ?? s.masterWeight,
    low: op.lowThreshold ?? s.low,
    med: op.medThreshold ?? s.med,
    high: op.highThreshold ?? s.high,
  };
}

/**
 * ACCT_MASTER_WEIGHT (SHIELD §6.1, settled in #26): the transaction's setOptions ops on the
 * user's account, applied in order to the account as Horizon has it, take the master key from
 * authorizing every operation alone to not. Reported at the first op after which it can't; an
 * account that was already multisig gets no finding. Blocked with no override, so the account
 * state must be read, not guessed: no state → unavailable, which the policy also blocks.
 */
export const ACCT_MASTER_WEIGHT: Rule = {
  id: "ACCT_MASTER_WEIGHT",
  evaluate(ctx) {
    const checked = checkedMasterKeyOps(ctx.decoded, ctx.userAccount);
    if (checked.length === 0) return [];
    const account = ctx.data.userAccount;
    if (account === undefined) return { unavailable: true, reason: "internal" };
    if (isUnavailable(account)) return account;
    // An account that doesn't exist can't be the source of an applied op.
    if (account === null) return [];
    const master = account.signers.find((s) => s.key === account.id);
    const before: KeyState = {
      masterWeight: master?.weight ?? 0,
      low: account.thresholds.low_threshold,
      med: account.thresholds.med_threshold,
      high: account.thresholds.high_threshold,
    };
    if (!masterAuthorizesAll(before)) return [];
    let state = before;
    let firstLoss: number | null = null;
    for (const { opIndex, op } of checked) {
      state = apply(state, op);
      if (!masterAuthorizesAll(state)) firstLoss ??= opIndex;
      else firstLoss = null;
    }
    if (firstLoss === null) return [];
    return [
      {
        ruleId: "ACCT_MASTER_WEIGHT",
        severity: "critical",
        confidence: "high",
        opIndex: firstLoss,
        evidence: {
          opNumber: String(firstLoss + 1),
          account: account.id,
          masterWeightBefore: String(before.masterWeight),
          masterWeightAfter: String(state.masterWeight),
          highestThresholdAfter: String(Math.max(state.low, state.med, state.high)),
        },
      },
    ];
  },
};
