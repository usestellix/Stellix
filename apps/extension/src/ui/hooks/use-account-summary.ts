import {
  getBaseReserveStroops,
  isStellixError,
  summarizeAccount,
  type AccountSummary,
  type ErrorCode,
  type HorizonClient,
  type NetworkId,
} from "@stellix/core";
import { useCallback, useEffect, useState } from "react";
import {
  UI_PREFIX,
  lastKnownBalance,
  rememberBalance,
  uiSessionStore,
  wasFundedThisSession,
  type LastKnownBalance,
} from "../lib/ui-session.js";

// Home balance (UI_FLOWS §4). Fetches on open and again when the popup regains focus
// (refetch-on-focus, ARCHITECTURE §9). No polling while closed (NETWORK.md §6).

export type SummaryState =
  | { kind: "loading" }
  | { kind: "funded"; summary: Extract<AccountSummary, { funded: true }> }
  /** `wasReset`: funded earlier this session, now 404 → testnet was reset. */
  | { kind: "unfunded"; wasReset: boolean }
  | { kind: "error"; code: ErrorCode; lastKnown: LastKnownBalance | null };

export function useAccountSummary(
  publicKey: string | null,
  network: NetworkId,
  horizon: HorizonClient | null,
): { state: SummaryState; refresh: () => void } {
  const [state, setState] = useState<SummaryState>({ kind: "loading" });
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    if (publicKey === null || horizon === null) return;
    // An object flag: TS would narrow a `let` to `true` inside the async block and miss cleanup.
    const run = { cancelled: false };
    const store = uiSessionStore();
    void (async () => {
      let next: SummaryState;
      try {
        const [account, reserve] = await Promise.all([
          horizon.getAccount(publicKey),
          getBaseReserveStroops(network, horizon, { store, prefix: UI_PREFIX }),
        ]);
        const summary = summarizeAccount(account, reserve);
        if (summary.funded) {
          await rememberBalance(store, network, publicKey, summary, Date.now());
          next = { kind: "funded", summary };
        } else {
          next = {
            kind: "unfunded",
            wasReset:
              network === "testnet" && (await wasFundedThisSession(store, network, publicKey)),
          };
        }
      } catch (err: unknown) {
        next = {
          kind: "error",
          code: isStellixError(err) ? err.code : "INTERNAL_ERROR",
          lastKnown: await lastKnownBalance(store, network, publicKey).catch(() => null),
        };
      }
      if (!run.cancelled) setState(next);
    })();
    return () => {
      run.cancelled = true;
    };
  }, [publicKey, network, horizon, generation]);

  const refresh = useCallback(() => {
    setGeneration((g) => g + 1);
  }, []);

  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  return { state, refresh };
}
