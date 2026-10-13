/**
 * Runs tasks one at a time, in arrival order. Mutating handlers go through it so concurrent
 * requests (e.g. two ADD_ACCOUNT) can't interleave their read-modify-write of storage.
 * Module state here is only a scheduling cache: if the worker dies, queued work dies with it.
 */
export function createSerialQueue(): <T>(task: () => Promise<T>) => Promise<T> {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  };
}
