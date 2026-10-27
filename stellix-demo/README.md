# Stellix website

The marketing site for Stellix, a non-custodial Stellar wallet browser extension. A static
Next.js export served by Cloudflare Pages: no backend, no API routes, no analytics, no
third-party scripts, and no wallet functionality.

It lives in the extension repository but is fully isolated: its own pnpm root
(`pnpm-workspace.yaml`), lockfile, lint and format config, and CI job (`site` in
`.github/workflows/ci.yml`). Nothing here imports from the extension, and nothing assumes
this folder's location, so it can move to its own repository unchanged.

## Commands

```bash
pnpm install --frozen-lockfile
pnpm dev            # local dev server
pnpm build          # static export to out/
pnpm typecheck
pnpm lint
pnpm format:check
```

Set `NEXT_TELEMETRY_DISABLED=1` (CI does) so Next.js sends no usage data.

## Rules

- Dependencies: exact versions, each at least 14 days old (`minimumReleaseAge` in
  `pnpm-workspace.yaml`), every one justified in the commit that adds it.
- Design tokens live only in `src/styles/tokens.css`.
- Fonts are self-hosted (`src/fonts/`, Geist under the SIL OFL 1.1).
- Copy rules and claim sources: see `CLAUDE.md`.
