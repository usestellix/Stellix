# 0001 — Browser extension first, not a hosted web wallet

- Status: Accepted
- Date: 2026-10-11

## Context
Stellix is non-custodial: keys live on the user's device. The two web-delivered options are (a) a hosted website that stores encrypted keys in browser storage and signs in-page, or (b) a browser extension.

A hosted site loads its JavaScript from our server on every visit. Whoever controls the server, the CDN, the DNS, or any bundled dependency can ship new code to all users instantly, and an XSS bug on the origin exposes keys to injected scripts. There is no review step and no versioning visible to users.

## Decision
Ship the MVP as a Chrome Manifest V3 extension (Firefox build via WXT as a secondary target).

## Consequences
- Code is bundled and versioned; updates go through store review. MV3 forbids remote code.
- The attack surface moves to the build pipeline and store accounts. Addressed in SECURITY.md §9 (CI-only publishing, hardware 2FA, reproducible builds).
- We must design around MV3 lifecycles: the service worker is terminated when idle, the popup is destroyed on blur (ARCHITECTURE.md §2).
- Users need desktop Chrome/Chromium or Firefox. Mobile users are served later by a native app (MOBILE_MIGRATION.md).

## Alternatives considered
- **Hosted web wallet**: rejected for the reasons above; acceptable only for a testnet-only demo.
- **Mobile first**: better fit for payments users, but slower to iterate on and harder to test; the core/shell split (ADR 0002) keeps it cheap to add next.
