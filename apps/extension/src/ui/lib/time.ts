// Times in activity rows (UI_FLOWS §7), with the platform's Intl only: no date library.

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" });
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 min. ago", "3 hr. ago", "yesterday", "4 days ago", then "Oct 3" / "Oct 3, 2025". */
export function relativeTime(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  const ago = now - at;
  if (ago < MINUTE) return "just now";
  if (ago < HOUR) return RELATIVE.format(-Math.floor(ago / MINUTE), "minute");
  if (ago < DAY) return RELATIVE.format(-Math.floor(ago / HOUR), "hour");
  if (ago < 7 * DAY) return RELATIVE.format(-Math.floor(ago / DAY), "day");
  const date = new Date(at);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString("en", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Full local date and time for the detail screen. */
export function fullTime(iso: string): string {
  const at = Date.parse(iso);
  return Number.isNaN(at)
    ? iso
    : new Date(at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
