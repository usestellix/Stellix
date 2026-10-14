import { StellixError } from "../errors.js";
import { nativeBalanceOf, type AccountRecord } from "../network/horizon-schemas.js";
import { parseHorizonAmount } from "./amount.js";
import { availableStroops, minimumBalanceStroops } from "./reserve.js";

// What Home shows (UI_FLOWS §4, PRODUCT §5.2: "show the truth about money").

export type AccountSummary =
  | { funded: false }
  | {
      funded: true;
      totalStroops: bigint;
      /** Locked: minimum balance plus XLM held by open sell offers. */
      reservedStroops: bigint;
      availableStroops: bigint;
      minimumBalanceStroops: bigint;
      /** Extra signers or raised thresholds: sending is blocked (STELLAR_PRIMER §5.5). */
      multisig: boolean;
    };

export function summarizeAccount(
  account: AccountRecord | null,
  baseReserveStroops: bigint,
): AccountSummary {
  if (account === null) return { funded: false };
  const native = nativeBalanceOf(account);
  if (native === null)
    throw new StellixError("HORIZON_BAD_RESPONSE", "Account has no native balance");

  const total = parseHorizonAmount(native.balance);
  const selling = parseHorizonAmount(native.selling_liabilities);
  const minimum = minimumBalanceStroops(
    {
      subentryCount: account.subentry_count,
      numSponsoring: account.num_sponsoring ?? 0,
      numSponsored: account.num_sponsored ?? 0,
    },
    baseReserveStroops,
  );
  const available = availableStroops(total, minimum, selling);
  return {
    funded: true,
    totalStroops: total,
    reservedStroops: total - available,
    availableStroops: available,
    minimumBalanceStroops: minimum,
    multisig: isMultisig(account),
  };
}

/**
 * Supported (NETWORK.md §4): exactly one signer, the account's own key with weight 1, and every
 * threshold ≤ 1. Anything else is multisig.
 */
export function isMultisig(account: AccountRecord): boolean {
  const [only, ...rest] = account.signers;
  const singleOwnSigner =
    only !== undefined && rest.length === 0 && only.key === account.id && only.weight === 1;
  const { low_threshold, med_threshold, high_threshold } = account.thresholds;
  return !(singleOwnSigner && low_threshold <= 1 && med_threshold <= 1 && high_threshold <= 1);
}
