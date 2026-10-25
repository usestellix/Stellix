import { StellixError } from "../errors.js";
import { decodeTransactionEnvelope } from "./decode/index.js";
import { buildReport } from "./report.js";
import { RULES, runRules } from "./rules/index.js";
import type { AnalysisReport, RuleData, ShieldDeps, ShieldRequest } from "./types.js";

// Public API of Shield (SHIELD §3, §4): decode → gather → rules → report. The report is
// evidence only; evaluate (policy) and assertSignable come with their own issues.

/**
 * Fetches what the rules need before they run. Each rule issue adds its lookups here, taking
 * the decoded request and deps; none exist yet.
 */
function gather(): Promise<RuleData> {
  return Promise.resolve({});
}

export async function analyze(req: ShieldRequest, deps: ShieldDeps): Promise<AnalysisReport> {
  if (req.kind !== "transaction") {
    // Auth entries arrive in S3, SEP-53 messages in S2.
    throw new StellixError("SHIELD_INPUT_INVALID", `Unsupported request kind: ${req.kind}`);
  }
  const { decoded, hashHex } = decodeTransactionEnvelope(req.xdr, req.network);
  const now = deps.now();
  const data = await gather();
  const { findings, checksUnavailable } = runRules(RULES, {
    request: req,
    decoded,
    network: req.network,
    origin: req.origin,
    userAccount: deps.userAccount,
    now,
    data,
  });
  return buildReport({
    digest: hashHex,
    network: req.network,
    decoded,
    simulation: { status: "not_applicable" },
    findings,
    checksUnavailable,
    createdAt: now,
  });
}

export { REPORT_TTL_MS, reportExpiresAt } from "./report.js";
export { RULES, RULE_SET_VERSION, runRules, type RuleRun } from "./rules/index.js";
export { THRESHOLDS } from "./rules/thresholds.js";
export * from "./types.js";
