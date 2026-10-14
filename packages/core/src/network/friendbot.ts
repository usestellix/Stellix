import { StellixError } from "../errors.js";
import type { Platform } from "../platform.js";
import { isAccountId } from "../stellar/address.js";
import { NETWORKS, type NetworkId } from "./config.js";
import type { HorizonClient } from "./horizon-client.js";

// Friendbot (TRANSACTIONS.md §6, STELLAR_PRIMER §10). Testnet only.
//
// Friendbot's own response is never trusted to decide the outcome: it answers 400 "already funded"
// for success-equivalent cases and can time out after funding. So after ANY response or error,
// refetch the account from Horizon: funded → success; still unfunded → FRIENDBOT_FAILED.
// A Horizon failure on that refetch propagates (e.g. NETWORK_ERROR); it is never shown as success.

const FRIENDBOT_TIMEOUT_MS = 40_000;

export async function fundWithFriendbot(
  network: NetworkId,
  address: string,
  horizon: HorizonClient,
  platform: Pick<Platform, "fetch">,
): Promise<void> {
  const friendbotUrl = NETWORKS[network].friendbotUrl;
  if (friendbotUrl === undefined) {
    throw new StellixError("NOT_AVAILABLE_ON_NETWORK", "Friendbot is testnet only");
  }
  if (!isAccountId(address)) throw new StellixError("INVALID_ADDRESS", "Not an account address");

  const url = `${friendbotUrl}/?addr=${encodeURIComponent(address)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, FRIENDBOT_TIMEOUT_MS);
  try {
    const res = await platform.fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    await res.body?.cancel();
  } catch {
    // Outcome is decided by the refetch below.
  } finally {
    clearTimeout(timer);
  }

  const account = await horizon.getAccount(address);
  if (account === null)
    throw new StellixError("FRIENDBOT_FAILED", "Account still unfunded after Friendbot", true);
}
