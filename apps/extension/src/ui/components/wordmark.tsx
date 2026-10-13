/**
 * Stellix wordmark: a neutral geometric mark (a diamond in a rounded square) plus the name.
 * Deliberately plain: no gradient, no glow, no sparkle, and nothing that echoes the Stellar
 * Development Foundation's own logo.
 */
export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 text-ink">
      <svg viewBox="0 0 20 20" className="size-5 shrink-0" aria-hidden="true">
        <rect width="20" height="20" rx="5.5" fill="currentColor" />
        <path d="M10 5.25 14.75 10 10 14.75 5.25 10Z" fill="var(--color-surface)" />
      </svg>
      <span className="text-[15px] font-semibold tracking-[-0.02em]">Stellix</span>
    </span>
  );
}
