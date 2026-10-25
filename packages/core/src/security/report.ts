import type { NetworkId } from "../network/config.js";
import { RULE_SET_VERSION } from "./rules/index.js";
import type {
  AnalysisReport,
  CheckUnavailable,
  DecodedRequest,
  Finding,
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
