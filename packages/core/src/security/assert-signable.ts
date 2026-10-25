import { StellixError } from "../errors.js";
import { decodeTransactionEnvelope } from "./decode/index.js";
import { evaluate } from "./policy/policy.js";
import { RULE_SET_VERSION } from "./rules/index.js";
import type { AnalysisReport, Origin, ShieldRequest } from "./types.js";

// The single enforcement point (SHIELD §4, invariant 15). The SW signing handler calls this
// immediately before signing; nothing else decides whether to sign. It trusts no decision it is
// handed: the digest is recomputed from the request and the policy is re-evaluated here.

/** What the user did on the review screen, as recorded by the SW. */
export type Confirmation = { kind: "click" } | { kind: "typed"; phrase: string };

function fail(code: ConstructorParameters<typeof StellixError>[0], message: string): never {
  throw new StellixError(code, message);
}

function sameOrigin(a: Origin, b: Origin): boolean {
  if (a.type === "dapp" || b.type === "dapp") {
    return a.type === "dapp" && b.type === "dapp" && a.url === b.url;
  }
  return a.type === b.type;
}

/**
 * Throws a StellixError unless `req` may be signed now on the strength of `report`. Checks run
 * in a fixed order; the first failure wins:
 * pasted origin → SHIELD_BLOCKED; network → NETWORK_MISMATCH; origin or digest →
 * SHIELD_DIGEST_MISMATCH (undecodable → SHIELD_INPUT_INVALID); rule-set version or expiry →
 * SHIELD_REPORT_EXPIRED; decision blocked → SHIELD_BLOCKED; review without the required
 * confirmation → SHIELD_CONFIRMATION_REQUIRED.
 */
export function assertSignable(
  req: ShieldRequest,
  report: AnalysisReport,
  confirmation: Confirmation | null,
  now: number,
): void {
  if (req.kind !== "transaction") fail("SHIELD_INPUT_INVALID", "Only transactions are signable");
  // Mode C is advisory: nothing pasted is ever signed (SHIELD §2).
  if (req.origin.type === "pasted") fail("SHIELD_BLOCKED", "Pasted requests are never signed");
  if (req.network !== report.network) fail("NETWORK_MISMATCH", "Report is for another network");
  if (!sameOrigin(req.origin, report.origin)) {
    fail("SHIELD_DIGEST_MISMATCH", "Report is for another origin");
  }
  const { hashHex } = decodeTransactionEnvelope(req.xdr, req.network);
  if (hashHex !== report.digest) fail("SHIELD_DIGEST_MISMATCH", "Request changed after analysis");
  if (report.ruleSetVersion !== RULE_SET_VERSION) {
    fail("SHIELD_REPORT_EXPIRED", "Report was made by another rule-set version");
  }
  // Written so that NaN counts as expired.
  if (!(now < report.expiresAt)) fail("SHIELD_REPORT_EXPIRED", "Report has expired");

  const decision = evaluate(report, { origin: req.origin.type });
  switch (decision.state) {
    case "ready":
      return;
    case "blocked":
      return fail("SHIELD_BLOCKED", "Policy blocks this request");
    case "review":
      if (decision.requires === "click" && confirmation !== null) return;
      if (
        confirmation?.kind === "typed" &&
        decision.typedPhrase !== undefined &&
        confirmation.phrase === decision.typedPhrase
      ) {
        return;
      }
      return fail(
        "SHIELD_CONFIRMATION_REQUIRED",
        `Review requires ${decision.requires} confirmation`,
      );
  }
}
