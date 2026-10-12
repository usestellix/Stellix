import { isStellixError, type ErrorCode, type WalletStatus } from "@stellix/core";
import { useCallback, useEffect, useState } from "react";
import { request } from "../../messaging/client.js";

export type StatusState =
  | { kind: "loading" }
  | { kind: "ready"; status: WalletStatus }
  | { kind: "error"; code: ErrorCode };

/** Never rejects: failures become an error state. */
async function fetchStatus(): Promise<StatusState> {
  try {
    return { kind: "ready", status: await request("GET_STATUS", undefined) };
  } catch (err: unknown) {
    return { kind: "error", code: isStellixError(err) ? err.code : "INTERNAL_ERROR" };
  }
}

/** Session state from the SW, the source of truth (ARCHITECTURE §9). */
export function useStatus(): { state: StatusState; refresh: () => void } {
  const [state, setState] = useState<StatusState>({ kind: "loading" });
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let current = true;
    void fetchStatus().then((next) => {
      if (current) setState(next);
    });
    return () => {
      current = false;
    };
  }, [generation]);

  const refresh = useCallback(() => {
    setState({ kind: "loading" });
    setGeneration((g) => g + 1);
  }, []);

  return { state, refresh };
}
