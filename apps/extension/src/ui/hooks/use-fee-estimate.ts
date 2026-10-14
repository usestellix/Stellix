import { feeFromStats, fallbackFee, type FeeChoice, type HorizonClient } from "@stellix/core";
import { useEffect, useState } from "react";

/** Popup-side fee estimate for "Max" (TRANSACTIONS §6). The SW recomputes during PREPARE. */
export function useFeeEstimate(horizon: HorizonClient): FeeChoice | null {
  const [fee, setFee] = useState<FeeChoice | null>(null);
  useEffect(() => {
    let current = true;
    void horizon.getFeeStats().then(
      (stats) => {
        if (current) setFee(feeFromStats(stats));
      },
      () => {
        if (current) setFee(fallbackFee(null, Date.now()));
      },
    );
    return () => {
      current = false;
    };
  }, [horizon]);
  return fee;
}
