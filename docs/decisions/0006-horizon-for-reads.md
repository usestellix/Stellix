# 0006 — Horizon as the read backend for the MVP, despite its end-of-life status

- Status: Accepted
- Date: 2026-10-14

## Context
NETWORK.md assumed Horizon as the read and submit backend, and asked us to check SDF's position before relying on it. As of 2026-10-14:

- **Horizon is end-of-life.** SDF's APIs overview says Horizon "is nearing end-of-life and will eventually be deprecated in favor of Stellar RPC and Portfolio APIs". It "will continue to receive updates to maintain compatibility with upcoming protocol releases" but "won't receive new feature development". No deprecation date is given.
- **Stellar RPC is SDF's recommended real-time API, but it doesn't cover a wallet's needs.**
  - Transaction history is retained for only about 7 days.
  - There's no per-account payment history.
  - The base reserve isn't exposed directly; it would mean decoding ledger-header XDR.
  - Balances would come from decoding `getLedgerEntries` XDR.
- **The Portfolio API** has no public, documented endpoints yet.
- **SDF's public Horizon** truncated its history to one year on 2024-08-01. SDF's Horizon docs list only testnet and futurenet as SDF-hosted endpoints. `horizon.stellar.org` serves mainnet today (verified live: Horizon v29, protocol 29), but it isn't documented as a committed service.
- **CORS (verified live):** both SDF Horizons echo the `chrome-extension://` origin in `Access-Control-Allow-Origin`, and Friendbot sends `*`. Extension pages and the service worker can call them with no `host_permissions` (CLAUDE.md §6.11).

## Decision
- **The MVP reads from Horizon** through core's `HorizonClient` interface (NETWORK.md §2), which already isolates callers from the backend.
- **Defaults:** testnet uses `https://horizon-testnet.stellar.org`. Mainnet keeps `https://horizon.stellar.org` as the default while mainnet stays gated (CLAUDE.md §6.14).
- **Before any public mainnet release (M5),** a mainnet provider is chosen and documented (operator, retention, rate limits, privacy terms). This is an M5 exit criterion. The comparison and proposed default are in ADR 0009; 0.1.0 is testnet-only (ADR 0008).
- **History (M4)** must allow for the one-year window on SDF's Horizon: older activity may be absent, so the UI never implies "no older activity".

## Consequences
- M2 needs no XDR decoding for reads: Horizon's JSON plus zod schemas (NETWORK.md §2).
- Moving reads to RPC or an indexer later means a new `HorizonClient` implementation, with no changes for callers. The interface name stays for now; rename it if the backend changes.
- Users may set a custom Horizon URL per network. It's validated by checking the passphrase it reports (NETWORK.md §1), with a warning (SECURITY T12).
- A deprecation announcement with a date triggers a follow-up ADR.

## Alternatives considered
- **RPC-first now:** rejected for the MVP. It covers live balances, but it's missing per-account history and would still need Horizon or an indexer for M4. It also adds XDR decoding to every read.
- **A third-party indexer API:** postponed. It adds a dependency on a company's API and its privacy terms. Revisit when choosing the mainnet provider (M5).
