import {
  NO_TOML,
  createTomlFetcher,
  type Platform,
  type SendDeps,
  type TomlFetcher,
} from "@stellix/core";

// Shield wiring for the service worker (SHIELD §3.1, #24, #35). In Mode A, analysis (PREPARE) and
// assertSignable (CONFIRM) run inside core's send service, called by the PREPARE_PAYMENT and
// CONFIRM_PAYMENT handlers; this module supplies what Shield reads from outside core. The report
// lives in session storage beside the prepared tx and never travels in a message.

/**
 * Shield's dependencies for Stellix's own flows (Mode A). No stellar.toml: these flows build no
 * changeTrust, so they need none and add no network destination (invariant 21).
 */
export function modeAShieldDeps(): Pick<SendDeps, "toml"> {
  return { toml: NO_TOML };
}

/**
 * Mode C (SHIELD_ANALYZE) reads issuers' stellar.toml (§6.8): https only, no redirects, no
 * credentials, 5 s, 100 KB, cached in session storage for an hour. A network destination listed
 * in PRIVACY.md (invariant 21).
 */
export function modeCTomlFetcher(platform: Platform): TomlFetcher {
  return createTomlFetcher({
    fetch: platform.fetch,
    session: platform.session,
    now: () => platform.now(),
  });
}
