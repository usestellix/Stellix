/** Joins class names, skipping falsy values. (30 lines beat a dependency; SECURITY §8.) */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
