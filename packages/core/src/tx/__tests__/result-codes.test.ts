import { describe, expect, it } from "vitest";
import { fixture } from "../../network/__tests__/fixtures.js";
import { mapResultCodes } from "../errors.js";
import { decodeResultXdr } from "../result-codes.js";

describe("decodeResultXdr (captured testnet XDR)", () => {
  it("async ERROR for a stale sequence → tx_bad_seq", () => {
    const body = fixture("submit-async-bad-seq").body as {
      error_result_xdr: string;
      tx_status: string;
    };
    expect(body.tx_status).toBe("ERROR");
    expect(decodeResultXdr(body.error_result_xdr)).toEqual({ transaction: "tx_bad_seq" });
  });

  it("failed in a ledger → tx_failed / op_no_destination", () => {
    const body = fixture("transaction-failed").body as { result_xdr: string; successful: boolean };
    expect(body.successful).toBe(false);
    expect(decodeResultXdr(body.result_xdr)).toEqual({
      transaction: "tx_failed",
      operations: ["op_no_destination"],
    });
  });

  it("successful transaction decodes to txSUCCESS-style code", () => {
    const body = fixture("transaction-success").body as { result_xdr: string };
    expect(decodeResultXdr(body.result_xdr).transaction).toBe("tx_success");
  });

  it("garbage → unknown", () => {
    expect(decodeResultXdr("!!!")).toEqual({ transaction: "unknown" });
  });
});

describe("mapResultCodes (every row of TRANSACTIONS §8)", () => {
  const tx = (transaction: string, operations?: string[]) => ({
    transaction,
    ...(operations ? { operations } : {}),
  });
  const codeOf = (r: ReturnType<typeof mapResultCodes>) =>
    r.kind === "failed" ? r.error.code : `rebuild:${r.reason}`;

  it.each([
    [tx("tx_bad_seq"), "payment", "rebuild:bad_seq"],
    [tx("tx_too_late"), "payment", "PREPARED_TX_EXPIRED"],
    [tx("tx_too_early"), "payment", "CLOCK_SKEW"],
    [tx("tx_insufficient_fee"), "payment", "FEE_TOO_LOW"],
    [tx("tx_insufficient_balance"), "payment", "INSUFFICIENT_BALANCE"],
    [tx("tx_bad_auth"), "payment", "SIGNING_FAILED"],
    [tx("tx_no_source_account"), "payment", "SOURCE_UNFUNDED"],
    [tx("tx_failed", ["op_underfunded"]), "payment", "INSUFFICIENT_BALANCE"],
    [tx("tx_failed", ["op_low_reserve"]), "createAccount", "BELOW_MIN_STARTING_BALANCE"],
    [tx("tx_failed", ["op_low_reserve"]), "payment", "INSUFFICIENT_BALANCE"],
    [tx("tx_failed", ["op_no_destination"]), "payment", "rebuild:destination_changed"],
    [tx("tx_failed", ["op_already_exists"]), "createAccount", "rebuild:destination_changed"],
    [tx("tx_failed", ["op_malformed"]), "payment", "INTERNAL_ERROR"],
    [tx("tx_failed", ["op_line_full"]), "payment", "UNKNOWN_TX_ERROR"],
    [tx("tx_internal_error"), "payment", "UNKNOWN_TX_ERROR"],
  ] as const)("%j (%s) → %s", (codes, kind, expected) => {
    expect(codeOf(mapResultCodes(codes, kind))).toBe(expected);
  });

  it("unknown codes are surfaced in the resultCode detail", () => {
    const r = mapResultCodes(tx("tx_failed", ["op_line_full"]), "payment");
    expect(r.kind === "failed" && r.error.details).toEqual({ resultCode: "op_line_full" });
  });
});
