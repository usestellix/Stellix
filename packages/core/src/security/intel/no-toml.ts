import type { TomlFetcher } from "../types.js";

/**
 * A TomlFetcher that never fetches: every lookup is unavailable ("no_source"), which the policy
 * treats as if the trust rules had fired. Mode A uses it: Stellix's own flows build no
 * changeTrust yet, so they need no stellar.toml and add no network destination (invariant 21).
 */
export const NO_TOML: TomlFetcher = {
  fetchToml: () => Promise.resolve({ unavailable: true, reason: "no_source" }),
};
