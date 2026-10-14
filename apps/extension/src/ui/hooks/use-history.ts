import { historyStreamUrl, horizonUrlFor, type HorizonClient, type Settings } from "@stellix/core";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  createHistoryController,
  type HistoryController,
  type HistorySnapshot,
} from "../lib/history-controller.js";
import { uiSessionStore } from "../lib/ui-session.js";

// History for the active account while the popup is open (lib/history-controller.ts). Owned by
// the unlocked app, so the stream survives moving between Home, Activity and the detail screen.

const NONE = {
  subscribe: () => () => undefined,
  snapshot: () => null,
};

export function useHistory(
  me: string | null,
  settings: Settings | null,
  horizon: HorizonClient | null,
): { snapshot: HistorySnapshot | null; controller: HistoryController | null } {
  const network = settings?.network ?? null;
  const base =
    settings === null ? null : horizonUrlFor(settings.network, settings.horizonOverrides);
  const controller = useMemo(
    () =>
      me === null || network === null || base === null || horizon === null
        ? null
        : createHistoryController({
            me,
            network,
            horizon,
            store: uiSessionStore(),
            streamUrl: (cursor) => historyStreamUrl(base, me, cursor),
            isVisible: () => document.visibilityState === "visible",
          }),
    [me, network, base, horizon],
  );

  useEffect(() => {
    if (controller === null) return;
    void controller.start();
    return () => {
      controller.stop();
    };
  }, [controller]);

  const snapshot = useSyncExternalStore(
    controller?.subscribe ?? NONE.subscribe,
    controller?.snapshot ?? NONE.snapshot,
  );
  return { snapshot, controller };
}
