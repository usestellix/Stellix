import { xdr } from "@stellar/stellar-sdk/base";
import { describe, expect, it } from "vitest";
import { fixture } from "../../__fixtures__/load.js";
import type { DecodedPreconditions } from "../../types.js";
import { decodeTransactionEnvelope } from "../envelope.js";
import { decodePreconditions } from "../preconditions.js";

// Every fixture is checked against Horizon's own decoding of the same captured transaction
// (`preconditions` in its transaction record), an independent source.

interface HorizonPreconditions {
  timebounds?: { min_time: string; max_time?: string };
  ledgerbounds?: { min_ledger: number; max_ledger?: number };
  min_account_sequence?: string;
  min_account_sequence_age?: string;
  min_account_sequence_ledger_gap?: number;
  extra_signers?: string[];
}

function decoded(name: string) {
  return decodeTransactionEnvelope(fixture(name).envelopeXdr, "testnet").decoded;
}

function horizon(name: string): HorizonPreconditions | null {
  const body = fixture(name).transaction.body as { preconditions?: HorizonPreconditions | null };
  return body.preconditions ?? null;
}

/** Horizon omits zero/absent values; this maps its JSON onto our shape. */
function fromHorizon(h: HorizonPreconditions | null): DecodedPreconditions {
  const maxTime = h?.timebounds?.max_time;
  const maxLedger = h?.ledgerbounds?.max_ledger;
  return {
    timeBounds:
      h?.timebounds === undefined
        ? null
        : {
            minTime: BigInt(h.timebounds.min_time),
            maxTime: maxTime === undefined || maxTime === "0" ? null : BigInt(maxTime),
          },
    ledgerBounds:
      h?.ledgerbounds === undefined
        ? null
        : {
            minLedger: h.ledgerbounds.min_ledger,
            maxLedger: maxLedger === undefined || maxLedger === 0 ? null : maxLedger,
          },
    minSeqNum: h?.min_account_sequence === undefined ? null : BigInt(h.min_account_sequence),
    minSeqAgeSeconds: BigInt(h?.min_account_sequence_age ?? "0"),
    minSeqLedgerGap: h?.min_account_sequence_ledger_gap ?? 0,
    extraSigners: (h?.extra_signers ?? []).map((key) => ({ type: "ed25519" as const, key })),
  };
}

describe("decodePreconditions", () => {
  it.each([
    "preconditions-none",
    "payment-native",
    "preconditions-no-max-time",
    "preconditions-all",
    "feeBump",
  ])("%s matches Horizon's decoding", (name) => {
    expect(decoded(name).preconditions).toEqual(fromHorizon(horizon(name)));
  });

  it("PRECOND_NONE: no bounds of any kind", () => {
    expect(decoded("preconditions-none").preconditions).toEqual({
      timeBounds: null,
      ledgerBounds: null,
      minSeqNum: null,
      minSeqAgeSeconds: 0n,
      minSeqLedgerGap: 0,
      extraSigners: [],
    });
    expect(decoded("preconditions-none").maxTime).toBeNull();
  });

  it("PRECOND_TIME: time bounds only", () => {
    const p = decoded("payment-native").preconditions;
    expect(p.timeBounds).toEqual({ minTime: 0n, maxTime: 1792927469n });
    expect(p.ledgerBounds).toBeNull();
    expect(p.minSeqNum).toBeNull();
  });

  it("absent maxTime (XDR 0) is null, not a time, and maxTime agrees", () => {
    const d = decoded("preconditions-no-max-time");
    expect(d.preconditions.timeBounds).toEqual({ minTime: 0n, maxTime: null });
    expect(d.maxTime).toBeNull();
  });

  it("PRECOND_V2: every field, typed", () => {
    expect(decoded("preconditions-all").preconditions).toEqual({
      timeBounds: { minTime: 1792927461n, maxTime: 1792927701n },
      ledgerBounds: { minLedger: 5380786, maxLedger: 5380886 },
      minSeqNum: 23110037903769627n,
      minSeqAgeSeconds: 1n,
      minSeqLedgerGap: 1,
      extraSigners: [
        { type: "ed25519", key: "GAZYHQEOCV5EBCFTHDN7AYVN6YU2BCU4Q64J6BMV2G2I33X4KRRRWQZB" },
      ],
    });
    expect(decoded("preconditions-all").maxTime).toBe(1792927701n);
  });

  it("a fee bump carries the inner transaction's preconditions", () => {
    const d = decoded("feeBump");
    expect(d.envelopeType).toBe("txFeeBump");
    expect(d.preconditions.timeBounds).toEqual({ minTime: 0n, maxTime: 1792927684n });
  });

  it("maxLedger 0 means no upper ledger bound", () => {
    const p = decodePreconditions(
      xdr.Preconditions.precondV2(
        new xdr.PreconditionsV2({
          timeBounds: null,
          ledgerBounds: new xdr.LedgerBounds({ minLedger: 10, maxLedger: 0 }),
          minSeqNum: null,
          minSeqAge: 0n,
          minSeqLedgerGap: 0,
          extraSigners: [],
        }),
      ),
    );
    expect(p.ledgerBounds).toEqual({ minLedger: 10, maxLedger: null });
    expect(p.timeBounds).toBeNull();
  });
});
