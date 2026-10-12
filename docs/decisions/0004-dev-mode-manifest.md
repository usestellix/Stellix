# 0004 — Dev-mode manifest differs from the release manifest

- Status: Accepted
- Date: 2026-10-12

## Context
CLAUDE.md §6.11–12 and SECURITY §4.1–4.2 require the manifest to declare exactly `storage` and `alarms`, no `host_permissions`, and the default CSP.

`pnpm dev` runs `wxt` in development mode, which rewrites the manifest it writes to `.output/chrome-mv3-dev/` so hot reload works. With WXT 0.21.4 the dev manifest adds:

- permissions `tabs` and `scripting`
- `host_permissions: ["http://localhost/*"]`
- a `commands` entry (`wxt:reload-extension`, Alt+R)
- `content_security_policy` allowing scripts from the dev server (`http://localhost:3000`) and `'wasm-unsafe-eval'`, plus a sandbox CSP with `'unsafe-eval'`

`wxt build` and `wxt zip` output (`.output/chrome-mv3/`) contain none of these.

## Decision
- The manifest invariants apply to the **release artifact**: the output of `pnpm build` / `pnpm zip`. Dev builds are exempt from them.
- Two checks enforce the release manifest:
  - `scripts/check-manifest.mjs` runs in CI after `pnpm build`. It requires `permissions` to be exactly `["storage","alarms"]` and fails if `host_permissions`, `optional_permissions`, `optional_host_permissions`, `content_scripts`, `externally_connectable`, `web_accessible_resources` or `content_security_policy` appear.
  - The E2E smoke test asserts the same at runtime via `chrome.runtime.getManifest()`. It skips this check when pointed at a dev build (`STELLIX_EXTENSION_DIR`).
- Dev builds are for development profiles only and are never distributed. Releases are built only in CI (SECURITY §9).

## Consequences
- Hot reload keeps working with no WXT configuration overrides.
- A dev profile running the dev build has broader permissions than the release, so don't use a dev profile holding real (mainnet) funds.
- If a WXT upgrade changes what release builds emit, CI fails at `check-manifest.mjs` before anything ships.

## Alternatives considered
- **Strip dev additions via a WXT `build:manifestGenerated` hook**: rejected. It breaks hot reload, and the dev manifest isn't what ships.
- **No `wxt` dev mode, only `wxt build --watch` + manual reload**: rejected. It's a worse workflow, with no security gain for the shipped artifact.
