// Reserves (STELLAR_PRIMER §4). All bigint stroops.

export interface ReserveInputs {
  subentryCount: number;
  numSponsoring: number;
  numSponsored: number;
}

/** (2 + subentries + sponsoring − sponsored) × baseReserve */
export function minimumBalanceStroops(inputs: ReserveInputs, baseReserveStroops: bigint): bigint {
  const entries =
    2n + BigInt(inputs.subentryCount) + BigInt(inputs.numSponsoring) - BigInt(inputs.numSponsored);
  return entries * baseReserveStroops;
}

/** balance − minimumBalance − sellingLiabilities, never below zero. */
export function availableStroops(
  balanceStroops: bigint,
  minimumBalance: bigint,
  sellingLiabilitiesStroops: bigint,
): bigint {
  const available = balanceStroops - minimumBalance - sellingLiabilitiesStroops;
  return available > 0n ? available : 0n;
}

/** createAccount needs at least 2 × baseReserve (1 XLM today). */
export function minimumStartingBalanceStroops(baseReserveStroops: bigint): bigint {
  return 2n * baseReserveStroops;
}
