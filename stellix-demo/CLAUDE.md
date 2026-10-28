# CLAUDE.md — Stellix website

@AGENTS.md

The marketing site for the Stellix extension. Static export only (`output: "export"`): no route
handlers, proxy, server actions, ISR, cookies or runtime image optimization. Follow the Emil
Kowalski design-engineering skill for motion and component craft.

## Isolation

- Never import from outside this folder (`../`) or from `@stellix/*`. ESLint enforces it.
- Never assume this folder sits inside the extension repo. Data from the extension (e.g. the
  privacy policy) is vendored here and checked against an extension tag, not read by path.

## Copy rules (non-negotiable)

- Never say Stellix or Shield makes anything "safe", "secure" or "protected" as a guarantee.
  Use: shows, decodes, flags, blocks known patterns.
- Every capability claim comes from `src/content/shield-status.ts`. A "coming" capability
  shows "Coming soon"; never hardcode a claim in page copy.
- "Shipped" means in the released Chrome Web Store build, not merged on `main`.
- State that the current release is testnet-only, driven by status, not hardcoded.
- Never imply affiliation with the Stellar Development Foundation.
- The install button links only to the official Chrome Web Store listing. Never offer a file.
- Any example transaction is labelled as an example, never presented as a live scan.

## Tokens and motion

- All tokens live in `src/styles/tokens.css`. Components use tokens, never raw values.
- Transforms read `--press-scale`, `--rise`, `--drop` so reduced motion removes them in one
  place; opacity fades remain. No animation on keyboard-initiated actions or focus.
