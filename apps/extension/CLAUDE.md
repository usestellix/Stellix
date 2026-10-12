# apps/extension — rules for this package

Chrome MV3 shell built with WXT + React + Tailwind. Read root `CLAUDE.md`, `docs/ARCHITECTURE.md`, and `docs/SECURITY.md` first.

## Contexts
- `src/entrypoints/background.ts` — service worker. **The only place secrets exist.** Handlers are thin: validate sender → zod-parse payload → call a `@stellix/core` service → map errors → respond. Re-hydrate everything from `chrome.storage.session`; module variables are caches only (the SW is killed when idle).
- `src/entrypoints/popup/` — main UI, 360×600. Never receives keys or the recovery phrase. May call core read-only network functions directly (public data).
- `src/entrypoints/onboarding/` — full-tab page for create / import / verify / reveal phrase. Only context allowed to receive the phrase (`ONBOARD_GENERATE`, `REVEAL_PHRASE`).

## Hard rules
- Manifest: permissions exactly `storage`, `alarms`. No `host_permissions`, `content_scripts`, `externally_connectable`, `web_accessible_resources` without an ADR.
- At SW startup: run storage migrations, `chrome.storage.session.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })`, re-check auto-lock, resume in-flight tx resolution.
- Every message: check `sender.id === chrome.runtime.id` and `sender.url` starts with `chrome.runtime.getURL("")`; enforce onboarding-only request types by URL; zod-validate payloads; return `true` from the listener for async responses.
- Auto-lock uses `chrome.alarms` (period 0.5 min), never `setTimeout` in the SW.
- `GET_STATUS` does not count as user activity.
- No secrets in React state/props/context. No copy button for the recovery phrase. Phrase blurred until revealed.
- Bigints cross messaging as decimal strings.
- All user-facing error text comes from `src/ui/errorCopy.ts`, keyed by `ErrorCode`.
- No `eval`, `new Function`, inline scripts, remote code, or CSP changes.
- Extension APIs via `import { browser } from "wxt/browser"` (the raw `chrome` object on Chromium). WXT auto-imports are disabled (`imports: false`); import everything explicitly.
- The dev build's manifest has extra permissions and a relaxed CSP for hot reload (ADR 0004). Only `pnpm build` output must satisfy the manifest rules, and `scripts/check-manifest.mjs` checks it.

## Layout
```
src/
├── entrypoints/{background.ts, popup/, onboarding/}
├── messaging/      request/response types, zod schemas, client (UI side), router (SW side), sender checks
├── storage/        chrome.storage adapters implementing core KeyValueStore; migrations.ts
├── background/     handler implementations, autolock.ts, inflight.ts
└── ui/             screens/, components/, hooks/, errorCopy.ts
```

## Verify before done
`pnpm typecheck && pnpm lint && pnpm test`, then run `pnpm dev`, load `apps/extension/.output/chrome-mv3-dev` as an unpacked extension in `chrome://extensions` (WXT doesn't launch a browser because `web-ext` isn't installed), and walk every state for the screens you touched (docs/UI_FLOWS.md). For SW changes, terminate the worker from `chrome://serviceworker-internals` mid-flow and confirm recovery.
