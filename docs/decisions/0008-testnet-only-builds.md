# 0008 — Testnet-only builds: the MAINNET_ENABLED build flag

- Status: Accepted
- Date: 2026-10-17

## Context
The MVP has had mainnet support since M2, gated behind a confirmation (CLAUDE.md §6.14). Two M5 prerequisites for real funds aren't met yet:
- the external security review of `core/keys`, `core/vault`, `core/tx` and the SW message handler (ROADMAP M5);
- a documented mainnet Horizon provider (ADR 0006; comparison in ADR 0009).

A UI-only gate isn't enough for a public release. The extension would still contain the code path, and any extension page could send `SET_SETTINGS` with `acknowledgedRealFunds: true`.

## Decision
- **A build-time flag, `STELLIX_MAINNET_ENABLED`, default off.** `wxt.config.ts` turns it into the constant `__STELLIX_MAINNET_ENABLED__`. Only `"true"` enables mainnet; unset, empty or `"false"` disables it, and any other value fails the build.
- **Core stays free of build flags.** The shell reads the constant once (`src/build-flags.ts`) and passes `enabledNetworks` to core:
  - `updateSettings` rejects a disabled network, and a Horizon override for one, with `INVALID_REQUEST`. This applies even when the mainnet acknowledgement is present.
  - `restrictSettingsToNetworks` runs at SW startup, after migrations. A stored network the build doesn't offer (from an earlier mainnet-enabled build) falls back to testnet, and overrides for disabled networks are dropped.
- **UI:** off-builds don't render the Network row, and the network screen is behind the constant, so the minifier drops it and its mainnet copy. About shows "Networks: Testnet only".
- **Enforced in CI:**
  - `scripts/check-bundle.mjs` fails an off-build that contains the mainnet confirmation copy.
  - A separate `e2e-mainnet` job builds with the flag on and runs the `@mainnet` specs.
  - The default E2E run covers the testnet-only behaviour.
- **The first public release (0.1.0) is built with the flag off.** Mainnet ships in a later release, after the external review and the provider choice.

## Consequences
- Core's network list, the mainnet config, and the mainnet confirmation flow stay in the codebase and stay tested, just not shipped.
- Enabling mainnet later is a release decision (one variable in the release workflow), not a code change. It still requires the review and the provider ADR.
- A user with a stored mainnet setting (only possible from a dev or flag-on build) silently moves to testnet. Their keys are unaffected.

## Alternatives considered
- **A runtime setting or remote switch:** rejected. Stellix has no server (CLAUDE.md §1), and a local setting is exactly what the flag must not be.
- **Deleting the mainnet code until it's needed:** rejected. It would rot untested, and re-adding it would be a large, unreviewed diff right before a real-funds release.
