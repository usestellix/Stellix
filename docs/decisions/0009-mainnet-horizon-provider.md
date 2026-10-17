# 0009 — Mainnet Horizon provider

- Status: **Proposed.** The decision is made with the mainnet release, after the external review (ADR 0008).
- Date: 2026-10-17

## Context
ADR 0006 keeps Horizon as the MVP backend and makes a documented mainnet provider an M5 prerequisite for mainnet. 0.1.0 ships testnet-only (ADR 0008), so this ADR records the requirements and the comparison now, and the choice later.

## Requirements

**Hard requirements:**
1. **CORS allows `chrome-extension://` origins.** Calls come straight from extension pages and the service worker, with no `host_permissions` (CLAUDE.md §6.11).
2. **No secret API key.** Anything in the bundle is public, so a keyed endpoint either leaks its key or needs a proxy, which would be a server we operate (CLAUDE.md §1).
3. The endpoints we use: account, payments with `join=transactions`, effects, fee stats, `/transactions_async` (ADR 0007), and SSE streaming (NETWORK §6). Without SSE the wallet falls back to polling.

**Then compared on:**
- **History retention:** how far back activity goes (UI_FLOWS §7 already avoids implying "no older activity").
- **Rate limits, and how they're keyed.** A per-IP limit is shared by everyone behind the same IP. Users on carrier-grade NAT (mobile networks, some ISPs), offices or VPNs can exhaust it together and get 429s they didn't cause.
- Logging and privacy terms, since the operator sees IPs and account IDs (PRIVACY.md).
- SLA, and self-hosting cost as a fallback.

## Findings (tested 2026-10-17 from a `chrome-extension://` origin)

| Provider | Secret key | CORS | History back to | SSE | Rate limit | Privacy terms |
|---|---|---|---|---|---|---|
| **SDF** `horizon.stellar.org` | No | Echoes the origin | 2025-08-29 (~13.5 months; SDF documents 1 year since 2024-08-01) | Yes | **3,600 requests/hour per IP** (documented). Each streamed update counts as a request. | SDF's privacy policy says it doesn't cover the network software; Horizon logging isn't documented |
| **Ankr** public `rpc.ankr.com/http/stellar_horizon` | No (Stellar's provider list says Ankr needs a key; the public endpoint answered without one) | `*` | 2025-09-04 (~13 months) | Yes | Not documented for Stellar | Uses IP for rate limiting and routing; says it doesn't correlate wallet transactions with IPs |
| **LOBSTR** `horizon.stellar.lobstr.co` | No | Echoes the origin | 2026-09-15 (~1 month) | Yes | Not documented | Not reviewed |
| **Tatum** gateway | No | Echoes the origin | 2026-08-26 (~7 weeks) | **No** (HTTP 500) | Not documented | Not reviewed |
| Blockdaemon (the only one with full history), Validation Cloud, QuickNode, Obsrvr, Nodies | **Key required** | — | — | — | — | Excluded by requirement 2 |

- **SLA:** none of the keyless options offers one.
- **Self-hosting** (SDF's prerequisites, for **30 days** of history): a 4 vCPU / 16 GB / 100 GB SSD Horizon server, plus a 4 vCPU / 32 GB / 2 TB NVMe (at least 7K IOPS) Postgres server; more for longer retention. It would also be a server operated by us, which CLAUDE.md §1 rules out without a new ADR and a product decision.

### The per-IP limit as a selection criterion
At 3,600 requests per hour per IP, one wallet is far below the limit. A streamed update and a page load are a handful of requests. But the limit is per IP, not per user. Behind carrier-grade NAT, one public IP can carry many users, and they all share it. A provider whose limits are per IP is therefore judged on:
- **headroom per IP**, not per user;
- **how a 429 is handled.** Stellix retries a 429 only with a short `Retry-After`, then shows `RATE_LIMITED` (NETWORK §2) and keeps the last known balance, so a shared limit degrades the wallet without breaking it;
- **whether users can switch away**, which they can: a custom Horizon URL per network (NETWORK §1).

Prefer a provider that documents its limits and how they're keyed. An undocumented limit can't be planned around.

## Proposed direction (to confirm at the mainnet release)
- **Default:** SDF `horizon.stellar.org`. It meets every hard requirement, has the longest keyless history, documents its rate limit, and supports SSE.
- **Documented alternative:** the Ankr public endpoint, offered in docs as a custom Horizon URL. It isn't an automatic fallback: silently sending a user's IP and account IDs to a second operator would need their consent (PRIVACY.md).
- **Before deciding:** re-run these probes; read SDF's and Ankr's current terms; ask SDF whether `horizon.stellar.org` is a committed public service and what it logs; and check the per-IP limit against expected users.

## Consequences
- 0.1.0 is unaffected; its default is `horizon-testnet.stellar.org`.
- Accepting this ADR, with the provider named in PRIVACY.md and the store listing, is a precondition for building with `STELLIX_MAINNET_ENABLED=true` (ADR 0008).

## Sources
- [Horizon providers](https://developers.stellar.org/docs/data/apis/horizon/providers)
- [Rate limiting](https://developers.stellar.org/docs/data/apis/horizon/api-reference/structure/rate-limiting)
- [Horizon prerequisites](https://developers.stellar.org/docs/data/apis/horizon/admin-guide/prerequisites)
- [Ankr IP policy](https://ankr.com/blog/ankrs-ip-address-policy-and-your-privacy)
- [SDF privacy policy](https://stellar.org/privacy-policy)
- [Public endpoints (CompareNodes)](https://www.comparenodes.com/library/public-endpoints/stellar/)
- Live probes: `history_elder_ledger` closing times, CORS response headers, SSE content type, and `/transactions_async` reachability, run 2026-10-17.
