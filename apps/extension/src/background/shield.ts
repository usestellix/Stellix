import { NO_TOML, type SendDeps } from "@stellix/core";

// Shield wiring for the service worker (SHIELD §3.1, #24). In Mode A, analysis (PREPARE) and
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
