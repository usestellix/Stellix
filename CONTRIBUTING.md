# Contributing to Stellix

Thanks for helping. Stellix is a non-custodial Stellar wallet: the code you touch protects people's keys and money. These rules exist for that reason.

## Before you start

1. Read `CLAUDE.md`, especially **§6, the non-negotiable invariants**. Breaking one is a bug even if every test passes. Then read the docs its §2 map points to for your area. For Shield work, also read `docs/SHIELD.md`.
2. **Pick an issue labelled `help wanted`** and comment that you'd like it. A maintainer assigns it. Only work on issues assigned to you.
3. **One open issue per contributor at a time.** Finish it (merged or closed), then pick the next.
4. Issues labelled **`maintainer-only`** aren't open for assignment. **`security-critical`** issues open to contributors get extra review. Code that decides whether to sign (the policy engine, `assertSignable`, the SW signing handlers) is maintainer-only.
5. Check the issue's **Depends on**. If a dependency isn't merged yet, wait or ask in the issue.

## Setup

Requirements: Node `24.19.0` (`.nvmrc`) and pnpm `11.24.0` (the `packageManager` field; `corepack enable` provides it).

```bash
pnpm install --frozen-lockfile
pnpm dev            # extension with hot reload → load apps/extension/.output/chrome-mv3-dev unpacked
```

| Command | What it runs |
|---|---|
| `scripts/gates.sh` | format check, typecheck, lint, no-console check, unit tests (stops at the first failure) |
| `pnpm test:testnet` | integration tests against Stellar testnet (needed for network/transaction changes) |
| `pnpm test:e2e` | Playwright against the built extension |
| `pnpm test:e2e:mainnet` | the `@mainnet` E2E specs against a mainnet-enabled build (available once M5 is merged) |

Testnet XLM is free: the wallet's **Fund with Friendbot** button, or `https://friendbot.stellar.org/?addr=G…`. Never use mainnet funds or mainnet keys in development or tests.

## Rules that reviews enforce

- **`packages/core` stays platform-free:** no `chrome.*`, DOM, React or Node built-ins. Inject platform access through the interfaces in `platform.ts`. ESLint enforces this.
- **Money is `bigint` stroops.** No `number` and no floats for amounts.
- **No secrets in `console.*`, errors, logs, storage or URLs.** `scripts/check-no-console.sh` checks the diff.
- **Typed errors only:** throw `StellixError` with a code from the closed `ErrorCode` union. User-facing text comes from `errorCopy` (or Shield's copy table).
- **No new dependencies without asking in the issue first.** They need exact pins, must be at least 14 days old (pnpm enforces this), and must be pure JS in core.
- **No new manifest permissions** without an ADR (`docs/decisions/`).
- **Tests come from real data.** Horizon fixtures are captured from testnet by scripts, never hand-written. SEP test vectors are copied verbatim from the spec, never generated.
- **Docs move with behaviour.** If you change something a doc describes, update the doc in the same PR.

## Branches, commits, pull requests

- **Branch:** `<issue-number>-<short-slug>`, e.g. `42-decode-payment-group`.
- **Commits:** conventional commits (`feat(core): …`, `fix(extension): …`, `test: …`, `docs: …`), one logical change per commit (CONVENTIONS §8).
- **Pull request:**
  - says `Closes #<issue>`;
  - meets every **Acceptance criterion** in the issue;
  - passes `scripts/gates.sh` locally and CI;
  - for network or transaction changes, also passes `pnpm test:testnet`;
  - for UI changes, includes screenshots in light and dark.
- Keep PRs to the issue's scope. Open a new issue for anything else you find.

## Reporting security issues

Don't open a public issue for a vulnerability. Use GitHub's **Report a vulnerability** form on the Security tab (private advisories). See `docs/INCIDENT_RESPONSE.md` once M5 is merged.
