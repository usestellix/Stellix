import { useEffect, useState } from "react";

/** The current time, refreshed every `everyMs` so relative times ("5 min. ago") stay right. */
export function useNow(everyMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => {
      setNow(Date.now());
    }, everyMs);
    return () => {
      window.clearInterval(t);
    };
  }, [everyMs]);
  return now;
}
