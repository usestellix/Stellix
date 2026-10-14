/** Runs at most `max` tasks at once (Accounts-screen balances: ≤ 2 concurrent Horizon reads). */
export function createLimiter(max: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0;
  const waiting: (() => void)[] = [];
  const next = () => {
    if (active >= max) return;
    const start = waiting.shift();
    if (start !== undefined) start();
  };
  return <T>(task: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      waiting.push(() => {
        active++;
        task()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          });
      });
      next();
    });
}
