import type { InflightView } from "@stellix/core";
import { request } from "../../messaging/client.js";
import { errorCopy } from "../errorCopy.js";
import { displayXlm } from "../lib/xlm.js";
import { cx } from "../cx.js";
import { CheckIcon, AlertIcon } from "./icons.js";
import { Spinner } from "./spinner.js";

// Home banners (UI_FLOWS §1 "in-flight tx present"): a payment still confirming, or a finished
// outcome the user hasn't seen yet (e.g. the popup was closed while it resolved).

export function InflightBanners({
  items,
  onChange,
}: {
  items: readonly InflightView[];
  onChange: () => void;
}) {
  const visible = items.filter(
    (i) => i.status === "resolving" || (i.outcome !== null && i.outcome.status !== "rebuild"),
  );
  if (visible.length === 0) return null;
  return (
    <div className="space-y-2" data-testid="inflight-banners">
      {visible.map((i) => {
        const amount = `${displayXlm(BigInt(i.summary.amountStroops))} XLM`;
        const dismiss = async () => {
          await request("DISMISS_OUTCOME", { hash: i.hash }).catch(() => undefined);
          onChange();
        };
        if (i.status === "resolving") {
          return (
            <div
              key={i.hash}
              role="status"
              className="flex items-center gap-2.5 rounded-lg bg-fill px-3 py-2.5 text-[13px]"
              data-testid="banner-confirming"
            >
              <Spinner />
              <span>Confirming transaction… {amount}</span>
            </div>
          );
        }
        const ok = i.outcome?.status === "success";
        return (
          <div
            key={i.hash}
            role="status"
            data-testid={ok ? "banner-sent" : "banner-failed"}
            className={cx(
              "flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-[13px]",
              ok ? "bg-fill" : "bg-danger-fill text-danger",
            )}
          >
            {ok ? (
              <CheckIcon size={15} className="mt-0.5 shrink-0 text-success" />
            ) : (
              <AlertIcon size={15} className="mt-0.5 shrink-0" />
            )}
            <span className="flex-1">
              {ok
                ? `Sent ${amount}`
                : `Payment of ${amount} failed. ${i.outcome?.status === "failed" ? errorCopy(i.outcome.error.code) : ""}`}
            </span>
            <button
              type="button"
              onClick={() => void dismiss()}
              className="pressable -my-0.5 rounded px-1.5 py-0.5 text-[12px] font-medium hover-fine:bg-fill-strong"
            >
              Dismiss
            </button>
          </div>
        );
      })}
    </div>
  );
}
