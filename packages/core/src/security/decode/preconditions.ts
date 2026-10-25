import type { xdr } from "@stellar/stellar-sdk/base";
import { assertNever } from "../../assert-never.js";
import type { DecodedPreconditions } from "../types.js";
import { decodeSignerKey } from "./assets.js";

// Transaction preconditions (CAP-21) → typed values (SHIELD §3.1 decode/preconditions.ts).
// Decoding only: whether a value is risky is for the rules (NO_MAX_TIME, #33). XDR uses 0 for
// "no upper bound" in maxTime and maxLedger; here that is null, so it can't be read as a time.

/** What the network applies to a transaction without preconditions. */
export const NO_PRECONDITIONS: DecodedPreconditions = {
  timeBounds: null,
  ledgerBounds: null,
  minSeqNum: null,
  minSeqAgeSeconds: 0n,
  minSeqLedgerGap: 0,
  extraSigners: [],
};

function decodeTimeBounds(tb: xdr.TimeBounds | null): DecodedPreconditions["timeBounds"] {
  if (tb === null) return null;
  return { minTime: tb.minTime, maxTime: tb.maxTime === 0n ? null : tb.maxTime };
}

export function decodePreconditions(cond: xdr.Preconditions): DecodedPreconditions {
  switch (cond.type) {
    case "precondNone":
      return NO_PRECONDITIONS;
    case "precondTime":
      return { ...NO_PRECONDITIONS, timeBounds: decodeTimeBounds(cond.timeBounds) };
    case "precondV2": {
      const v2 = cond.v2;
      return {
        timeBounds: decodeTimeBounds(v2.timeBounds),
        ledgerBounds:
          v2.ledgerBounds === null
            ? null
            : {
                minLedger: v2.ledgerBounds.minLedger,
                maxLedger: v2.ledgerBounds.maxLedger === 0 ? null : v2.ledgerBounds.maxLedger,
              },
        minSeqNum: v2.minSeqNum,
        minSeqAgeSeconds: v2.minSeqAge,
        minSeqLedgerGap: v2.minSeqLedgerGap,
        extraSigners: v2.extraSigners.map(decodeSignerKey),
      };
    }
    default:
      return assertNever(cond);
  }
}
