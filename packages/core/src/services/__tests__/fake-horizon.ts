import { StellixError } from "../../errors.js";
import type { HorizonClient } from "../../network/horizon-client.js";
import { accountSchema, type AccountRecord } from "../../network/horizon-schemas.js";
import { fixture } from "../../network/__tests__/fixtures.js";

/** FakeHorizonClient (TESTING §1): accounts in `funded` exist; `failAt` throws NETWORK_ERROR. */
export function fakeHorizon(funded: ReadonlySet<string>, opts: { failOn?: string } = {}) {
  let inFlight = 0;
  let maxInFlight = 0;
  const requested: string[] = [];
  const template = accountSchema.parse(fixture("account-funded").body);
  const client: HorizonClient = {
    getRoot: () => Promise.reject(new Error("unused")),
    getLatestLedger: () => Promise.reject(new Error("unused")),
    getFeeStats: () => Promise.reject(new Error("unused")),
    getAccount: async (id): Promise<AccountRecord | null> => {
      requested.push(id);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
      if (id === opts.failOn) throw new StellixError("NETWORK_ERROR", "down", true);
      return funded.has(id) ? { ...template, id } : null;
    },
  };
  return { client, requested, maxInFlight: () => maxInFlight };
}
