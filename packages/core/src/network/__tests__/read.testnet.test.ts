import { describe, expect, it } from "vitest";
import { generateMnemonic } from "../../keys/mnemonic.js";
import { derivePublicKeys } from "../../services/onboarding.js";
import { discoverUsedIndices } from "../../services/discovery.js";
import { summarizeAccount } from "../../stellar/account-summary.js";
import { MemoryKeyValueStore } from "../../testing/memory-key-value-store.js";
import { getBaseReserveStroops } from "../base-reserve.js";
import { NETWORKS } from "../config.js";
import { fundWithFriendbot } from "../friendbot.js";
import { createHorizonClient } from "../horizon-client.js";
import { validateHorizonOverride } from "../horizon-url.js";

// Live Stellar testnet (TESTING §2). Fresh keys every run; never depends on existing testnet state.

const platform = { fetch: globalThis.fetch.bind(globalThis) };
const horizon = createHorizonClient(NETWORKS.testnet.horizonUrl, platform);

/** TESTING §2: retry Friendbot up to 3 times. */
async function fund(address: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await fundWithFriendbot("testnet", address, horizon, platform);
      return;
    } catch (err: unknown) {
      if (attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 2_000));
    }
  }
}

describe("testnet: reads", () => {
  it("a fresh address is unfunded, then funded by Friendbot", async () => {
    const [address] = await derivePublicKeys(generateMnemonic(), [0]);
    expect(await horizon.getAccount(address!)).toBeNull();
    await fund(address!);
    const account = await horizon.getAccount(address!);
    expect(account?.id).toBe(address);

    const reserve = await getBaseReserveStroops("testnet", horizon, {
      store: new MemoryKeyValueStore(),
      prefix: "t:",
    });
    expect(reserve).toBeGreaterThan(0n);
    const summary = summarizeAccount(account, reserve);
    expect(summary).toMatchObject({
      funded: true,
      multisig: false,
      minimumBalanceStroops: 2n * reserve,
    });
    if (summary.funded)
      expect(summary.availableStroops + summary.reservedStroops).toBe(summary.totalStroops);
  });

  it("Friendbot on an already-funded account still resolves as success", async () => {
    const [address] = await derivePublicKeys(generateMnemonic(), [0]);
    await fund(address!);
    await fundWithFriendbot("testnet", address!, horizon, platform);
  });

  it("discovers funded indices across a gap", async () => {
    const mnemonic = generateMnemonic();
    const keys = await derivePublicKeys(mnemonic, [0, 1, 2]);
    await fund(keys[0]!);
    await fund(keys[2]!);
    const result = await discoverUsedIndices((batch) => derivePublicKeys(mnemonic, batch), horizon);
    expect(result).toMatchObject({ indices: [0, 2], incomplete: false });
  });

  it("the passphrase probe accepts testnet Horizon for testnet and rejects it for mainnet", async () => {
    const policy = { allowLocalhost: false };
    expect(
      await validateHorizonOverride(
        "https://horizon-testnet.stellar.org/",
        "testnet",
        policy,
        platform,
      ),
    ).toBe("https://horizon-testnet.stellar.org");
    await expect(
      validateHorizonOverride("https://horizon-testnet.stellar.org", "mainnet", policy, platform),
    ).rejects.toMatchObject({ code: "INVALID_HORIZON_URL" });
  });

  it("fee_stats parses (TESTING §2 scenario 7)", async () => {
    const stats = await horizon.getFeeStats();
    expect(BigInt(stats.last_ledger_base_fee)).toBeGreaterThan(0n);
  });
});
