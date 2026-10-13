import { useCallback, useRef } from "react";

/**
 * Wrong-password shake via WAAPI: hardware-accelerated, interruptible, no remount and no CSS
 * keyframe class to toggle. 280ms, transform only, decaying amplitude. Skipped entirely under
 * prefers-reduced-motion (the error text and red ring still communicate the failure).
 */
export function useShake<T extends HTMLElement>(): [React.RefObject<T | null>, () => void] {
  const ref = useRef<T>(null);
  const shake = useCallback(() => {
    const el = ref.current;
    if (el === null || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.animate(
      [
        { transform: "translateX(0)" },
        { transform: "translateX(-6px)" },
        { transform: "translateX(5px)" },
        { transform: "translateX(-3px)" },
        { transform: "translateX(1px)" },
        { transform: "translateX(0)" },
      ],
      { duration: 280, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
    );
  }, []);
  return [ref, shake];
}
