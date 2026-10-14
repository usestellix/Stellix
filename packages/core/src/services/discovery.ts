import type { HorizonClient } from "../network/horizon-client.js";

// Account discovery (KEY_MANAGEMENT §3). Scans indices 0, 1, 2, … and stops after GAP_LIMIT
// consecutive unfunded indices. Index 0 is always included.
//
// Keys are derived in small batches by the caller-supplied `derive`, which opens the seed, derives
// public keys and zeroes the seed before returning; only then are network calls made, with public
// keys alone. Requests are strictly sequential (one in flight) to be gentle on public Horizon.
// A network failure never aborts: the result is what was found so far, marked incomplete.

export const GAP_LIMIT = 5;
const DERIVE_BATCH = 10;
/** Hard stop so a misbehaving Horizon (everything "funded") can't scan forever. */
export const DISCOVERY_MAX_INDEX = 100;

export interface DiscoveryResult {
  /** Funded indices plus index 0, ascending. */
  indices: number[];
  /** Public key for every returned index. */
  publicKeys: Map<number, string>;
  /** True if a network error stopped the scan early. */
  incomplete: boolean;
}

export async function discoverUsedIndices(
  derive: (indices: readonly number[]) => Promise<string[]>,
  horizon: HorizonClient,
): Promise<DiscoveryResult> {
  const found = new Map<number, string>();
  let gap = 0;
  let incomplete = false;

  scan: for (let start = 0; start < DISCOVERY_MAX_INDEX; start += DERIVE_BATCH) {
    const batch = Array.from({ length: DERIVE_BATCH }, (_, i) => start + i);
    const keys = await derive(batch);
    for (const [i, index] of batch.entries()) {
      const publicKey = keys[i];
      if (publicKey === undefined) break scan;
      if (index === 0) found.set(0, publicKey);
      let funded: boolean;
      try {
        funded = (await horizon.getAccount(publicKey)) !== null;
      } catch {
        incomplete = true;
        break scan;
      }
      if (funded) {
        found.set(index, publicKey);
        gap = 0;
      } else if (++gap >= GAP_LIMIT) {
        break scan;
      }
    }
  }

  const indices = [...found.keys()].sort((a, b) => a - b);
  return { indices, publicKeys: found, incomplete };
}
