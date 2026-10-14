import { accountSchema } from "../../network/horizon-schemas.js";
import { fixture } from "../../network/__tests__/fixtures.js";
import { FakeHorizonClient } from "../../testing/fake-horizon.js";

/** Discovery-style fake: accounts in `funded` exist; `failOn` throws NETWORK_ERROR. */
export function fakeHorizon(funded: ReadonlySet<string>, opts: { failOn?: string } = {}) {
  const client = new FakeHorizonClient();
  const template = accountSchema.parse(fixture("account-funded").body);
  for (const id of funded) client.accounts.set(id, { ...template, id });
  if (opts.failOn !== undefined) client.failingAccounts.add(opts.failOn);
  return {
    client,
    get requested() {
      return client.calls.filter((c) => c.method === "getAccount").map((c) => c.arg ?? "");
    },
    maxInFlight: () => client.maxInFlight,
  };
}
