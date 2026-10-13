// Uniform random integers from crypto.getRandomValues (SECURITY §3.4: never Math.random).

/** Uniform integer in [0, maxExclusive), by rejection sampling (no modulo bias). */
export function randomInt(maxExclusive: number): number {
  if (!Number.isSafeInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 2 ** 32) {
    throw new RangeError("maxExclusive out of range");
  }
  const limit = Math.floor(2 ** 32 / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    const value = buf[0] ?? 0;
    if (value < limit) return value % maxExclusive;
  }
}

/** `count` distinct integers from [0, maxExclusive), ascending. */
export function randomDistinct(count: number, maxExclusive: number): number[] {
  if (count > maxExclusive) throw new RangeError("count exceeds range");
  const picked = new Set<number>();
  while (picked.size < count) picked.add(randomInt(maxExclusive));
  return [...picked].sort((a, b) => a - b);
}
