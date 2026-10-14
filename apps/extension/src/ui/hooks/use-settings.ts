import {
  createHorizonClient,
  horizonUrlFor,
  type HorizonClient,
  type Settings,
} from "@stellix/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { request } from "../../messaging/client.js";

/** Settings from the SW (GET_SETTINGS: passive, doesn't count as activity). */
export function useSettings(): {
  settings: Settings | null;
  reload: () => void;
  set: (s: Settings) => void;
} {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    let current = true;
    void request("GET_SETTINGS", undefined).then(
      (s) => {
        if (current) setSettings(s);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [generation]);
  const reload = useCallback(() => {
    setGeneration((g) => g + 1);
  }, []);
  return { settings, reload, set: setSettings };
}

/**
 * Horizon for the selected network. Public reads run in the popup directly (ARCHITECTURE §5);
 * only an Accept header is sent, so no host_permissions are needed (ADR 0006).
 */
export function useHorizon(settings: Settings | null): HorizonClient | null {
  return useMemo(() => {
    if (settings === null) return null;
    const url = horizonUrlFor(settings.network, settings.horizonOverrides);
    return createHorizonClient(url, { fetch: globalThis.fetch.bind(globalThis) });
  }, [settings]);
}
