import { StellixError } from "../errors.js";
import type { Platform } from "../platform.js";
import { NETWORKS, type NetworkId } from "./config.js";
import { createHorizonClient, type HorizonClientOptions } from "./horizon-client.js";

// Custom Horizon URL per network (NETWORK.md §1, SECURITY T12).

export interface HorizonUrlPolicy {
  /** Dev builds only: allow http://localhost / 127.0.0.1 for a local Horizon. */
  allowLocalhost: boolean;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Syntax and scheme check. Returns the normalized URL (no trailing slash). */
export function normalizeHorizonUrl(input: string, policy: HorizonUrlPolicy): string {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new StellixError("INVALID_HORIZON_URL", "Not a URL");
  }
  const local = LOCAL_HOSTS.has(url.hostname);
  const schemeOk =
    url.protocol === "https:" || (url.protocol === "http:" && local && policy.allowLocalhost);
  if (!schemeOk) throw new StellixError("INVALID_HORIZON_URL", "Horizon URL must use https");
  if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    throw new StellixError(
      "INVALID_HORIZON_URL",
      "Horizon URL must not include credentials, query or fragment",
    );
  }
  return url.toString().replace(/\/+$/, "");
}

/**
 * Probes GET / and requires the server's network_passphrase to match the network it's being set
 * for. Catches e.g. a testnet Horizon configured as "mainnet". Unreachable → NETWORK_ERROR.
 */
export async function validateHorizonOverride(
  input: string,
  network: NetworkId,
  policy: HorizonUrlPolicy,
  platform: Pick<Platform, "fetch">,
  clientOptions?: HorizonClientOptions,
): Promise<string> {
  const url = normalizeHorizonUrl(input, policy);
  let passphrase: string;
  try {
    passphrase = (await createHorizonClient(url, platform, clientOptions).getRoot())
      .network_passphrase;
  } catch (err: unknown) {
    if (err instanceof StellixError && err.code === "HORIZON_BAD_RESPONSE") {
      throw new StellixError("INVALID_HORIZON_URL", "That server isn't a Horizon instance");
    }
    throw err;
  }
  if (passphrase !== NETWORKS[network].passphrase) {
    throw new StellixError("INVALID_HORIZON_URL", "Horizon serves a different network");
  }
  return url;
}
