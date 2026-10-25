import type { NetworkId } from "../network/config.js";
import { evaluate } from "./policy/policy.js";
import { RULE_SET_VERSION } from "./rules/index.js";
import type {
  AnalysisReport,
  CheckUnavailable,
  DecodedRequest,
  Finding,
  Origin,
  PolicyDecision,
  SimulationStatus,
} from "./types.js";

/** A report outlives neither its transaction nor this window (SHIELD §4). */
export const REPORT_TTL_MS = 300_000;

/** min(maxTime, createdAt + REPORT_TTL_MS), in epoch ms. `maxTime` is in seconds. */
export function reportExpiresAt(createdAt: number, maxTime: bigint | null): number {
  const ttlEnd = createdAt + REPORT_TTL_MS;
  if (maxTime === null) return ttlEnd;
  const maxTimeMs = maxTime * 1000n;
  return maxTimeMs < BigInt(ttlEnd) ? Number(maxTimeMs) : ttlEnd;
}

export interface ReportInput {
  digest: string;
  network: NetworkId;
  origin: Origin;
  decoded: DecodedRequest;
  simulation: SimulationStatus;
  findings: readonly Finding[];
  checksUnavailable: readonly CheckUnavailable[];
  createdAt: number;
}

export function buildReport(input: ReportInput): AnalysisReport {
  return {
    ...input,
    ruleSetVersion: RULE_SET_VERSION,
    expiresAt: reportExpiresAt(input.createdAt, input.decoded.maxTime),
  };
}

/**
 * A report as the SW keeps it in session storage beside the request it was made for. The
 * decoded request holds bigints, which storage can't, so it's left out and decoded again from
 * the stored request when the report is read back (`fromStoredReport`).
 */
export type StoredReport = Omit<AnalysisReport, "decoded">;

export function toStoredReport(report: AnalysisReport): StoredReport {
  return {
    digest: report.digest,
    network: report.network,
    origin: report.origin,
    ruleSetVersion: report.ruleSetVersion,
    simulation: report.simulation,
    findings: report.findings,
    checksUnavailable: report.checksUnavailable,
    createdAt: report.createdAt,
    expiresAt: report.expiresAt,
  };
}

export function fromStoredReport(stored: StoredReport, decoded: DecodedRequest): AnalysisReport {
  return { ...stored, decoded };
}

/**
 * What a UI receives of a report: public data, no decoded request. Reports never travel the
 * other way; the SW signs only on the report it stored itself.
 */
export interface ReportView {
  digest: string;
  network: NetworkId;
  ruleSetVersion: string;
  findings: readonly Finding[];
  checksUnavailable: readonly CheckUnavailable[];
  /**
   * Display only, for the review screen. Never an input to signing: assertSignable re-evaluates
   * the stored report at confirm (invariant 15).
   */
  decision: PolicyDecision;
  createdAt: number;
  expiresAt: number;
}

export function reportView(report: AnalysisReport): ReportView {
  return {
    digest: report.digest,
    network: report.network,
    ruleSetVersion: report.ruleSetVersion,
    findings: report.findings,
    checksUnavailable: report.checksUnavailable,
    decision: evaluate(report, { origin: report.origin.type }),
    createdAt: report.createdAt,
    expiresAt: report.expiresAt,
  };
}
