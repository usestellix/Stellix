import { parseHorizonAmount } from "../../stellar/amount.js";
import type { PathRecord } from "../../network/horizon-schemas.js";
import type { DecodedAsset } from "../decode/operation-types.js";
import { resolveSources } from "../decode/sources.js";
import { isUnavailable } from "../lookups.js";
import type { DecodedRequest, Finding, Rule } from "../types.js";
import { formatRatio, formatStroops } from "./format.js";
import { THRESHOLDS } from "./thresholds.js";

/**
 * PATH_LOW_MIN (SHIELD §6.1, §6.7): a path payment from the user whose limit allows a loss
 * beyond the threshold compared with the best route Horizon's path finding returns for the same
 * assets and amount.
 *
 * - Strict send (fixed amount sent): the best route delivers D; destMin allows (D − destMin)/D.
 * - Strict receive (fixed amount delivered): the best route costs S; sendMax allows
 *   (sendMax − S)/S.
 */

export interface CheckedPathPayment {
  opIndex: number;
  mode: "strictSend" | "strictReceive";
  sendAsset: DecodedAsset;
  destAsset: DecodedAsset;
  /** Strict send: the amount sent. Strict receive: the amount delivered. */
  fixedStroops: bigint;
  /** Strict send: destMin. Strict receive: sendMax. */
  limitStroops: bigint;
}

/**
 * The path payments the rule checks, in op order; shared with the gather step so it fetches
 * exactly what the rule reads. Non-positive amounts are skipped: the network rejects them.
 */
export function checkedPathPayments(
  decoded: DecodedRequest,
  userAccount: string,
): CheckedPathPayment[] {
  const sources = resolveSources(decoded, userAccount);
  const out: CheckedPathPayment[] = [];
  decoded.operations.forEach((op, opIndex) => {
    if (sources.ops[opIndex]?.isUser !== true) return;
    if (op.kind === "pathPaymentStrictSend" && op.sendAmountStroops > 0n) {
      out.push({
        opIndex,
        mode: "strictSend",
        sendAsset: op.sendAsset,
        destAsset: op.destAsset,
        fixedStroops: op.sendAmountStroops,
        limitStroops: op.destMinStroops,
      });
    } else if (op.kind === "pathPaymentStrictReceive" && op.destAmountStroops > 0n) {
      out.push({
        opIndex,
        mode: "strictReceive",
        sendAsset: op.sendAsset,
        destAsset: op.destAsset,
        fixedStroops: op.destAmountStroops,
        limitStroops: op.sendMaxStroops,
      });
    }
  });
  return out;
}

type Side = "source" | "destination";

function matches(record: PathRecord, side: Side, asset: DecodedAsset): boolean {
  const type = record[`${side}_asset_type`];
  if (asset.type === "native") return type === "native";
  return (
    type !== "native" &&
    record[`${side}_asset_code`] === asset.code &&
    record[`${side}_asset_issuer`] === asset.issuer
  );
}

function assetLabel(asset: DecodedAsset): string {
  return asset.type === "native" ? "XLM" : asset.code;
}

const BPS = 10_000n;

export const PATH_LOW_MIN: Rule = {
  id: "PATH_LOW_MIN",
  evaluate(ctx) {
    const findings: Finding[] = [];
    for (const payment of checkedPathPayments(ctx.decoded, ctx.userAccount)) {
      const paths = ctx.data.paths.get(payment.opIndex);
      if (paths === undefined) return { unavailable: true, reason: "internal" };
      if (isUnavailable(paths)) return paths;

      const send = payment.mode === "strictSend";
      // Only routes between the op's own assets count; Horizon returns nothing else for these
      // queries, but a response is never trusted to.
      const amounts = paths
        .filter((p) => matches(p, "source", payment.sendAsset))
        .filter((p) => matches(p, "destination", payment.destAsset))
        .map((p) => parseHorizonAmount(send ? p.destination_amount : p.source_amount));
      // No route: no reference, which is never a pass (§6.7).
      if (amounts.length === 0) return { unavailable: true, reason: "not_found" };
      // Strict send: the most delivered. Strict receive: the least paid.
      const best = amounts.reduce((a, b) => (send ? (b > a ? b : a) : b < a ? b : a));
      if (best <= 0n) return { unavailable: true, reason: "bad_response" };

      const loss = send ? best - payment.limitStroops : payment.limitStroops - best;
      const maxBps = BigInt(THRESHOLDS.PATH_LOW_MIN.maxLossVsBestPathBps);
      if (loss <= 0n || loss * BPS <= maxBps * best) continue;

      const lossBps = (loss * BPS) / best;
      const limitAsset = send ? payment.destAsset : payment.sendAsset;
      findings.push({
        ruleId: "PATH_LOW_MIN",
        severity: "high",
        confidence: "high",
        opIndex: payment.opIndex,
        evidence: {
          opNumber: String(payment.opIndex + 1),
          sendAsset: assetLabel(payment.sendAsset),
          destAsset: assetLabel(payment.destAsset),
          limitKind: send ? "minimum to receive" : "maximum to send",
          limitAmount: formatStroops(payment.limitStroops),
          limitAsset: assetLabel(limitAsset),
          bestAmount: formatStroops(best),
          lossAmount: formatStroops(loss),
          lossBps: lossBps.toString(),
          lossPercent: formatRatio(lossBps, 100n, 2),
        },
      });
    }
    return findings;
  },
};
