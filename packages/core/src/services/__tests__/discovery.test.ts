import { describe, expect, it } from "vitest";
import { DISCOVERY_MAX_INDEX, GAP_LIMIT, discoverUsedIndices } from "../discovery.js";
import { fakeHorizon } from "./fake-horizon.js";

const keyFor = (i: number) => `G-${String(i)}`;
const derive = (log: number[][]) => (indices: readonly number[]) => {
  log.push([...indices]);
  return Promise.resolve(indices.map(keyFor));
};

describe("discoverUsedIndices (KEY_MANAGEMENT §3)", () => {
  it("always includes index 0, even unfunded, and stops after 5 consecutive misses", async () => {
    const h = fakeHorizon(new Set());
    const result = await discoverUsedIndices(derive([]), h.client);
    expect(result).toMatchObject({ indices: [0], incomplete: false });
    expect(h.requested).toEqual([0, 1, 2, 3, 4].map(keyFor));
    expect(GAP_LIMIT).toBe(5);
  });

  it("finds used accounts across gaps shorter than the limit", async () => {
    const h = fakeHorizon(new Set([0, 1, 4, 9].map(keyFor)));
    const result = await discoverUsedIndices(derive([]), h.client);
    expect(result.indices).toEqual([0, 1, 4, 9]);
    expect(result.publicKeys.get(9)).toBe(keyFor(9));
    expect(h.requested.at(-1)).toBe(keyFor(14)); // 10..14 unfunded → stop
  });

  it("makes requests strictly one at a time", async () => {
    const h = fakeHorizon(new Set([0, 1, 2, 3].map(keyFor)));
    await discoverUsedIndices(derive([]), h.client);
    expect(h.maxInFlight()).toBe(1);
  });

  it("derives in batches, only as far as needed", async () => {
    const log: number[][] = [];
    // 0 hit, 1–3 miss, 4 hit, 5–7 miss, 8 hit, 9–13 miss → needs indices 10–13 from batch 2.
    const result = await discoverUsedIndices(
      derive(log),
      fakeHorizon(new Set([0, 4, 8].map(keyFor))).client,
    );
    expect(result.indices).toEqual([0, 4, 8]);
    expect(log).toEqual([
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
      [10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
    ]);
  });

  it("five consecutive misses end the scan even if a later index is funded", async () => {
    const result = await discoverUsedIndices(
      derive([]),
      fakeHorizon(new Set([0, 8].map(keyFor))).client,
    );
    expect(result.indices).toEqual([0]);
  });

  it("a network error stops the scan and keeps what was found, marked incomplete", async () => {
    const h = fakeHorizon(new Set([0, 1].map(keyFor)), { failOn: keyFor(2) });
    expect(await discoverUsedIndices(derive([]), h.client)).toMatchObject({
      indices: [0, 1],
      incomplete: true,
    });
  });

  it("an error on index 0 still returns index 0", async () => {
    const h = fakeHorizon(new Set(), { failOn: keyFor(0) });
    expect(await discoverUsedIndices(derive([]), h.client)).toMatchObject({
      indices: [0],
      incomplete: true,
    });
  });

  it("caps the scan if everything looks funded", async () => {
    const h = fakeHorizon(new Set(Array.from({ length: 500 }, (_, i) => keyFor(i))));
    const result = await discoverUsedIndices(derive([]), h.client);
    expect(result.indices).toHaveLength(DISCOVERY_MAX_INDEX);
  });
});
