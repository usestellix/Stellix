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
pnpm dev                 # local dev server
pnpm build               # static export to out/, then scripts/postbuild.mjs (phases, _headers)
pnpm preview [port]      # serve out/ like Cloudflare Pages: real headers, pretty URLs, Brotli
pnpm typecheck
pnpm lint
pnpm format:check
pnpm check:copy          # copy rules over the built pages (run after build)
pnpm sync:privacy --repo <extension repo> --ref <tag> [--check]
```

Set `NEXT_TELEMETRY_DISABLED=1` (CI does) so Next.js sends no usage data.

## Launch phases

What the site says is driven by `src/content/shield-status.ts`, the single source of truth for
capabilities. "Shipped" means in the released Chrome Web Store build.

- **Phase 1** (now): the holding page, `/privacy` and the 404 page. `postbuild.mjs` removes the
  phase 2 pages from the export.
- **Phase 2**: the full Shield-first site. It switches on by itself when any Shield S1 capability
  is marked `"shipped"`. Pages show "Coming soon" for everything not shipped.

Other switches in the same file: `RELEASE.mainnet` (removes every testnet-only notice) and
`PROJECT.repoPublic` (shows "open source, reproducible builds", release verification, GitHub
vulnerability reports and repository links). `src/content/site.ts` holds `CHROME_STORE_URL`.

## Deploying (Cloudflare Pages)

- Build command `pnpm build`, output directory `out`, Node from `.nvmrc`.
- Environment: `NEXT_TELEMETRY_DISABLED=1` and `SITE_URL` (the production origin, used for
  canonical URLs, the sitemap and link previews; previews fall back to `CF_PAGES_URL`).
- `out/_headers` is generated: one CSP for every path (script hashes of Next.js's inline
  scripts), HSTS, nosniff, Referrer-Policy, Permissions-Policy, frame-ancestors 'none'. Never
  edit it by hand.

## Before each launch

Phase 1:
- `PRIVACY.md` in the extension repo: fill the TODOs (last updated, contact, security email),
  tag the release, then `pnpm sync:privacy --repo <extension> --ref v0.1.0` and switch the CI
  check from `HEAD` to the tag.
- Set `SITE_URL` in the Pages project; check the headers on the preview deployment.

Phase 2:
- Mark the shipped capabilities in `shield-status.ts`; set `CHROME_STORE_URL`.
- Replace the store-asset screenshots with ones that show Shield's findings.
- If the repository is public, set `PROJECT.repoPublic`.

## Rules

- Dependencies: exact versions, each at least 14 days old (`minimumReleaseAge` in
  `pnpm-workspace.yaml`), every one justified in the commit that adds it.
- Design tokens live only in `src/styles/tokens.css`.
- Fonts are self-hosted (`src/fonts/`, Geist under the SIL OFL 1.1).
- Screenshots in `public/screenshots/` are the 360×600 popup cropped from the extension's store
  assets (`docs/store/assets`), as lossless WebP.
- Copy rules and claim sources: see `CLAUDE.md`.
