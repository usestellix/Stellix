// First focusable element on every page. Invisible until focused but always in the
// accessibility tree; it appears instantly, with no transition (keyboard action).
export function SkipLink() {
  return (
    <a
      href="#main"
      className="pointer-events-none absolute top-2 left-2 z-50 rounded-control bg-primary px-4 py-2 text-sm font-medium text-primary-fg opacity-0 focus:pointer-events-auto focus:opacity-100"
    >
      Skip to content
    </a>
  );
}
