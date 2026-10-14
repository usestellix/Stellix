import type { ErrorCode } from "@stellix/core";
import { useCallback, useEffect, useRef, useState } from "react";

// Copy to clipboard with a short "Copied" state (UI_FLOWS §6). Public data only: addresses and
// payment links; the recovery phrase never has a copy button (apps/extension/CLAUDE.md).
// navigator.clipboard works from the popup after a click without the clipboardWrite permission.

export const COPIED_MS = 1_500;

export function useCopy(): {
  copied: boolean;
  error: ErrorCode | null;
  copy: (text: string) => Promise<void>;
} {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<ErrorCode | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = useCallback(async (text: string) => {
    window.clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
      setError(null);
      setCopied(true);
      timer.current = window.setTimeout(() => {
        setCopied(false);
      }, COPIED_MS);
    } catch {
      setCopied(false);
      setError("CLIPBOARD_UNAVAILABLE");
    }
  }, []);

  return { copied, error, copy };
}
