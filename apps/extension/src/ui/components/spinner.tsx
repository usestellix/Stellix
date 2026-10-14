import { cx } from "../cx.js";

/**
 * Small, fast spinner: a faster spin makes waiting feel shorter (perceived performance).
 * Constant motion uses linear easing. Under reduced motion it holds still at reduced opacity.
 */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cx(
        "size-4 animate-[spin_600ms_linear_infinite] motion-reduce:animate-none motion-reduce:opacity-60",
        className,
      )}
      aria-hidden="true"
    >
      <circle
        cx="8"
        cy="8"
        r="6.25"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1.5"
      />
      <path
        d="M14.25 8A6.25 6.25 0 0 0 8 1.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
