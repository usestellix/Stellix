# 0010 — Stellix Shield: on-device pre-signing analysis

- Status: Accepted
- Date: 2026-10-25

## Context
The MVP signs only transactions Stellix builds itself, from a summary decoded from the built transaction (ADR 0003). The next features change that: dapp requests (SEP-43), Soroban contract calls and auth entries, and pasted transactions all hand Stellix XDR that someone else built. On Stellar, one such request can add a signer to the user's account, merge it away, sell its assets far below market, or authorize a contract call that moves tokens. Rendering the operations isn't enough for a non-technical user to see those risks.

Pre-signing analysis is the usual answer. The question is where it runs. Stellix's constraints (CLAUDE.md §1, §6):
- No server operated by us, and no analytics.
- Secrets and the signing decision stay in the service worker.
- `packages/core` stays platform-free, so the mobile app reuses it (ADR 0002).
- Mainnet waits for an external review (ADR 0008).

## Decision
- **Shield runs entirely on the device**, in `packages/core/src/security/`, with extension UI and messaging around it. The design is `docs/SHIELD.md`.
- **One pipeline for every request:** decode → simulate (Soroban, S3) → rules → policy. It reads only public data from the configured Horizon, the configured Stellar RPC (S3), an asset issuer's own `stellar.toml`, and a signed threat list (S4). Each destination is listed in `PRIVACY.md` before its phase ships.
- **Rules are deterministic and explainable.** Each is a pure function with a rule ID, severity, evidence and plain-language text. No ML. Highest severity wins, never averaged. A check that can't run is reported as unavailable, never as a pass.
- **Analysis is evidence; `assertSignable` decides.** The SW signing handler is the single enforcement point. It recomputes the request's digest and checks network, rule-set version, expiry and the policy decision before any signature. A report produced anywhere else is never accepted.
- **Delivery modes:** A, Stellix's own Send flow (S1, can block); C, analyze a pasted request (S1, advisory, never signs); B, dapp requests through an injected provider (S2 classic, S3 Soroban, S4 mainnet; can block).
- **It replaces** the earlier post-MVP "dapp provider" and "Soroban" roadmap items with phases S1–S4 (`docs/ROADMAP.md`).
- **The rules are in the invariants:** CLAUDE.md §6, invariants 15–22.

## Consequences
- No new party sees which transactions a user is about to sign. The ones that see anything are the Horizon/RPC operators the wallet already uses, and an issuer's domain when its `stellar.toml` is fetched.
- Shield works offline from any Stellix service and has no service to go down, be breached or be subpoenaed.
- Coverage is limited to what can be decoded and computed locally: there's no shared reputation feed beyond the signed threat lists (S4), and new attack patterns need a new rule release, not a server-side update.
- Thresholds and the rule set are versioned in the code (`rules/thresholds.ts`, `RULE_SET_VERSION`). Changing them invalidates outstanding reports.
- Shield adds code on the signing path. The policy engine, `assertSignable` and the SW signing handlers are maintainer-only (CONTRIBUTING.md) and are in scope for the external review before mainnet dapp signing (S4).
- Shield never says "safe". It can't protect signatures made in other wallets, and it's no guarantee.

## Alternatives considered
- **A remote scanning service** (a third-party transaction-simulation and threat API): rejected. Every request, with the user's account and the dapp's origin, would go to a third party before signing, which breaks "nothing phones home" (PRODUCT §5). Keyed APIs need a secret that can't ship in a public bundle (the same constraint as ADR 0009). Signing would depend on that service being up and honest, and its verdicts can't be explained or reproduced from the request alone.
- **A Stellix-operated REST backend for analysis:** rejected. It would be the server CLAUDE.md §1 rules out: an operator that sees every user's pending transactions, a breach and availability target, and a single point an attacker could compromise to approve a malicious request for everyone.
- **Render operations only, no analysis:** rejected. A complete list of operations is necessary but not enough; the dangerous cases (a signer add hidden among payments, an offer far below market, an auth tree reaching an unpresented contract) need computed findings and enforced blocks.
