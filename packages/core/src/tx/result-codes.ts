import { xdr } from "@stellar/stellar-sdk/base";

// Result codes from XDR (ADR 0007). The async submit returns only `error_result_xdr`, and failed
// in-ledger transactions only `result_xdr`.
//
// SDK 17's in-memory XDR unions are internal (camelCase tags, getters). Its JSON form uses
// Horizon's own snake_case names, so decoding goes through JSON:
//   { result: "tx_bad_seq" }
//   { result: { tx_failed: [{ op_inner: { payment: "no_destination" } }] } }
// Both shapes are pinned by captured testnet fixtures.

export interface ResultCodes {
  transaction: string;
  operations?: string[];
}

export function decodeResultXdr(base64: string): ResultCodes {
  let decoded: unknown;
  try {
    const value = xdr.TransactionResult.fromXdr(base64, "base64");
    decoded = JSON.parse(
      JSON.stringify(value, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v)),
    );
  } catch {
    return { transaction: "unknown" };
  }
  const result = (decoded as { result?: unknown }).result;
  if (typeof result === "string") return { transaction: result };
  if (typeof result === "object" && result !== null) {
    const [name, value] = Object.entries(result as Record<string, unknown>)[0] ?? [
      "unknown",
      undefined,
    ];
    if (Array.isArray(value)) return { transaction: name, operations: value.map(opCode) };
    return { transaction: name };
  }
  return { transaction: "unknown" };
}

/** { op_inner: { payment: "no_destination" } } → "op_no_destination"; "op_bad_auth" stays. */
function opCode(op: unknown): string {
  if (typeof op === "string") return op;
  if (typeof op !== "object" || op === null) return "op_unknown";
  const [outer, inner] = Object.entries(op as Record<string, unknown>)[0] ?? [
    "op_unknown",
    undefined,
  ];
  if (outer === "op_inner" && typeof inner === "object" && inner !== null) {
    const [, code] = Object.entries(inner as Record<string, unknown>)[0] ?? [undefined, undefined];
    if (typeof code === "string") return code.startsWith("op_") ? code : `op_${code}`;
    return "op_unknown";
  }
  return outer;
}
