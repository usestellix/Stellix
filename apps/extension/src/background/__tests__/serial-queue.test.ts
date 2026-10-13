import { describe, expect, it } from "vitest";
import { createSerialQueue } from "../serial-queue.js";

describe("createSerialQueue", () => {
  it("runs tasks one at a time in order", async () => {
    const run = createSerialQueue();
    const log: string[] = [];
    const task = (name: string, ms: number) => () =>
      new Promise<string>((resolve) => {
        log.push(`start ${name}`);
        setTimeout(() => {
          log.push(`end ${name}`);
          resolve(name);
        }, ms);
      });
    expect(await Promise.all([run(task("a", 20)), run(task("b", 1))])).toEqual(["a", "b"]);
    expect(log).toEqual(["start a", "end a", "start b", "end b"]);
  });

  it("keeps going after a failure", async () => {
    const run = createSerialQueue();
    await expect(run(() => Promise.reject(new Error("x")))).rejects.toThrow("x");
    await expect(run(() => Promise.resolve(1))).resolves.toBe(1);
  });
});
