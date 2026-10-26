import { StellixError } from "../errors.js";
import { decodeTransactionEnvelope } from "./decode/index.js";
import { gather } from "./gather.js";
import { buildReport } from "./report.js";
import { RULES, runRules } from "./rules/index.js";
import type { AnalysisReport, ShieldDeps, ShieldRequest } from "./types.js";

// Public API of Shield (SHIELD §3, §4): decode → gather → rules → report. The report is
// evidence only; evaluate (policy) and assertSignable come with their own issues.

export async function analyze(req: ShieldRequest, deps: ShieldDeps): Promise<AnalysisReport> {
  if (req.kind !== "transaction") {
    // Auth entries arrive in S3, SEP-53 messages in S2.
    throw new StellixError("SHIELD_INPUT_INVALID", `Unsupported request kind: ${req.kind}`);
  }
  const { decoded, hashHex } = decodeTransactionEnvelope(req.xdr, req.network);
  const now = deps.now();
  const data = await gather(decoded, deps);
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
    origin: req.origin,
    presented: req.presented,
    decoded,
    simulation: { status: "not_applicable" },
    findings,
    checksUnavailable,
    createdAt: now,
  });
}

export { assertSignable, type Confirmation } from "./assert-signable.js";
export { RULE_COPY, fillTemplate, findingCopy, type RuleCopy } from "./copy/index.js";
export {
  DESCRIBERS,
  describeOperation,
  operationSentences,
  type OperationSentence,
} from "./copy/operations.js";
export { describeClaimant, describePredicate } from "./copy/predicate.js";
export {
  CHECK_NAMES,
  EVIDENCE_LABELS,
  FINDINGS_UI_TEXT,
  SEVERITY_LABELS,
  UNAVAILABLE_REASON_TEXT,
} from "./copy/ui.js";
export {
  RULE_POLICY,
  SEVERITY_FLOOR,
  TYPED_CONFIRMATION_PHRASE,
  evaluate,
  ruleOutcome,
  type Policy,
  type PolicyOutcome,
} from "./policy/policy.js";
export { compareSeverity, maxSeverity } from "./policy/severity.js";
export {
  REPORT_TTL_MS,
  fromStoredReport,
  reportExpiresAt,
  reportView,
  toStoredReport,
  type ReportView,
  type StoredReport,
} from "./report.js";
export { RULES, RULE_SET_VERSION, runRules, type RuleRun } from "./rules/index.js";
export { THRESHOLDS } from "./rules/thresholds.js";
export { listOutflows, type Outflow } from "./rules/UNNAMED_OUTFLOW.js";
export { isUnavailable, pairKey, unavailableFrom } from "./lookups.js";
export { NO_TOML } from "./intel/no-toml.js";
export {
  TOML_CACHE_TTL_MS,
  TOML_MAX_BYTES,
  TOML_TIMEOUT_MS,
  createTomlFetcher,
  fetchableHomeDomain,
  type TomlFetcherDeps,
} from "./intel/toml.js";
export type * from "./decode/operation-types.js";
export {
  resolveSources,
  type DecodedSources,
  type OpSource,
  type ResolvedSource,
} from "./decode/sources.js";
export { ACCOUNT_FLAGS, TRUSTLINE_FLAGS } from "./decode/value-types.js";
export * from "./types.js";
