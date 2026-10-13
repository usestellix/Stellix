import { isStellixError, type ErrorCode } from "@stellix/core";
import { useCallback, useState } from "react";

export type RequestState =
  { kind: "idle" } | { kind: "working" } | { kind: "error"; code: ErrorCode };

export type ActionResult<T> = { ok: true; value: T } | { ok: false; code: ErrorCode };

/** Tracks one async action's state; failures become an ErrorCode (copy via errorCopy). */
export function useAction(): {
  state: RequestState;
  run: <T>(action: () => Promise<T>) => Promise<ActionResult<T>>;
  reset: () => void;
} {
  const [state, setState] = useState<RequestState>({ kind: "idle" });
  const run = useCallback(async <T>(action: () => Promise<T>): Promise<ActionResult<T>> => {
    setState({ kind: "working" });
    try {
      const value = await action();
      setState({ kind: "idle" });
      return { ok: true, value };
    } catch (err: unknown) {
      const code = isStellixError(err) ? err.code : "INTERNAL_ERROR";
      setState({ kind: "error", code });
      return { ok: false, code };
    }
  }, []);
  const reset = useCallback(() => {
    setState({ kind: "idle" });
  }, []);
  return { state, run, reset };
}
