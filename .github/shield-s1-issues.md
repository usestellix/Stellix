# Shield S1: GitHub issues (DRY RUN, nothing created yet)

The source for creating the Shield S1 issues on `usestellix/Stellix`. Nothing here exists on GitHub yet. After maintainer approval, the issues are created with `gh` **in the order listed**, so each issue's "Depends on" can reference real numbers. Keys like `C1` are replaced by `#<number>` when created.

Source of truth: `docs/SHIELD.md`. Section references (§) below are to that file unless stated otherwise.

Sequencing (SHIELD.md §0): work confined to `packages/core/src/security/` (plus fixtures, corpus, `scripts/`) may start now. Anything touching `apps/extension/` or the docs M5 edits waits for M5. Each issue states which applies on a **Can start** line. The only allowed `apps/extension/` change before M5 is the `errorCopy` text for new error codes (§0 exception).

Operation list checked against `@stellar/stellar-sdk` 17.1.0 on 2026-10-25. It decodes every classic op SHIELD.md §9 lists, plus `inflation` (obsolete, still decodable). `inflation` is added to issue D9 so nothing decodes to an unrendered op.

---

## Labels (created if missing)

| Label | Colour | Description |
|---|---|---|
| `shield` | `5319e7` | Stellix Shield (docs/SHIELD.md) |
| `phase:S1` | `0e8a16` | Shield phase S1: classic analysis, Modes A and C |
| `phase:S2` | `1d76db` | Shield phase S2: injected provider (classic) |
| `phase:S3` | `1d76db` | Shield phase S3: Soroban |
| `phase:S4` | `1d76db` | Shield phase S4: mainnet dapp requests |
| `area:decode` | `c5def5` | Decoders (security/decode) |
| `area:rules` | `c5def5` | Rules (security/rules) |
| `area:policy` | `c5def5` | Policy, report, assertSignable |
| `area:ui` | `c5def5` | Extension UI |
| `area:tests` | `c5def5` | Fixtures, corpus, test tooling |
| `area:docs` | `c5def5` | Docs and ADRs |
| `good first issue` | `7057ff` | Good for newcomers (GitHub default) |
| `help wanted` | `008672` | Open to contributors; comment to be assigned |
| `security-critical` | `b60205` | Decides or protects signing; extra review |
| `maintainer-only` | `000000` | Not open for assignment |
| `blocked` | `fbca04` | Waiting on a dependency or a decision |

## Milestone

`Shield S1`: "Classic pre-signing analysis, Modes A (Send) and C (Analyze). Exit criteria: docs/SHIELD.md §9 S1."

---

## Creation order and dependency graph

```
C1 ──┬──▶ C2 ──┐        (D0 docs: after M5, in parallel)
      ├──▶ C3 ──┼──▶ C4 (Mode A, after M5) ──▶ U3
      ├──▶ D1..D9 (decoders) ──▶ R1..R8 (rules) ──▶ T2 (corpus)
      ├──▶ R9 (copy table) ──▶ U1 (findings UI, after M5) ──▶ U2 (Analyze, after M5)
      └──▶ T1 (fixture capture; can start immediately)
Tracking: X2, X3, X4
```

| # | Key | Title | Labels | Owner |
|---|---|---|---|---|
| 1 | D0 | Shield docs: §11 updates + ADR 0010 | shield, phase:S1, area:docs, maintainer-only | maintainer |
| 2 | C1 | Core types, rule registry, `analyze()` skeleton, thresholds stub | shield, phase:S1, area:policy, security-critical, maintainer-only | maintainer |
| 3 | C2 | Digest binding + `assertSignable` | shield, phase:S1, area:policy, security-critical, maintainer-only | maintainer |
| 4 | C3 | Policy engine + mode matrix | shield, phase:S1, area:policy, security-critical, maintainer-only | maintainer |
| 5 | T1 | Testnet fixture-capture script for every classic op type | shield, phase:S1, area:tests, help wanted, good first issue | contributor |
| 6 | D1 | Decode envelope + fee-bump | shield, phase:S1, area:decode, help wanted | contributor |
| 7 | D2 | Decode preconditions | shield, phase:S1, area:decode, help wanted | contributor |
| 8 | D3 | Effective source + muxed source resolution | shield, phase:S1, area:decode, help wanted | contributor |
| 9 | D4 | Decode payment group | shield, phase:S1, area:decode, help wanted, good first issue | contributor |
| 10 | D5 | Decode DEX group | shield, phase:S1, area:decode, help wanted | contributor |
| 11 | D6 | Decode account-config group | shield, phase:S1, area:decode, help wanted | contributor |
| 12 | D7 | Decode trust/issuer group | shield, phase:S1, area:decode, help wanted | contributor |
| 13 | D8 | Decode claimable/sponsorship group | shield, phase:S1, area:decode, help wanted | contributor |
| 14 | D9 | Soroban ops + `inflation` → `UNSUPPORTED_OP` placeholder | shield, phase:S1, area:decode, help wanted, good first issue | contributor |
| 15 | C4 | Mode A: Shield inside `PREPARE_PAYMENT` / `CONFIRM_PAYMENT` | shield, phase:S1, area:policy, security-critical, maintainer-only | maintainer |
| 16 | R9 | Copy table: module + completeness test | shield, phase:S1, area:rules, help wanted, good first issue | contributor |
| 17 | R1 | Rules `ACCT_SIGNER_CHANGE` + `ACCT_MASTER_WEIGHT` | shield, phase:S1, area:rules, help wanted, security-critical | contributor, maintainer review required |
| 18 | R2 | Rules `ACCT_MERGE` + `FOREIGN_SOURCE_OP` | shield, phase:S1, area:rules, help wanted | contributor |
| 19 | R3 | Rule `UNNAMED_OUTFLOW` | shield, phase:S1, area:rules, help wanted | contributor |
| 20 | R4 | Rule `OFFER_BAD_PRICE` + Horizon order-book client | shield, phase:S1, area:rules, help wanted, blocked | contributor |
| 21 | R5 | Rule `PATH_LOW_MIN` + Horizon path-finding client | shield, phase:S1, area:rules, help wanted, blocked | contributor |
| 22 | R6 | Rules `TRUST_UNVERIFIED` + `TRUST_CLAWBACK` + `stellar.toml` fetcher | shield, phase:S1, area:rules, help wanted | contributor |
| 23 | R7 | Rules `CLAIMABLE_TO_OTHER` + `SPONSORSHIP_CHANGE` | shield, phase:S1, area:rules, help wanted, good first issue | contributor |
| 24 | R8 | Rules `NO_MAX_TIME` + `HIGH_FEE` | shield, phase:S1, area:rules, help wanted, good first issue, blocked | contributor |
| 25 | U1 | Findings UI components | shield, phase:S1, area:ui, help wanted | contributor |
| 26 | U2 | Analyze screen (Mode C) + `SHIELD_ANALYZE` | shield, phase:S1, area:ui, help wanted | contributor |
| 27 | U3 | Findings on the Send Review screen | shield, phase:S1, area:ui, help wanted | contributor |
| 28 | T2 | Classic adversarial corpus | shield, phase:S1, area:tests, help wanted | contributor |
| 29 | X2 | Tracking: Shield S2, injected provider (classic) | shield, phase:S2, blocked | maintainer |
| 30 | X3 | Tracking: Shield S3, Soroban | shield, phase:S3, blocked | maintainer |
| 31 | X4 | Tracking: Shield S4, mainnet dapp requests | shield, phase:S4, blocked | maintainer |

`blocked` on R4, R5 and R8: their thresholds (§6.3, §12) must be approved by the maintainer in C1 first. The label comes off when that happens.

All issues except X2–X4 go in milestone **Shield S1**.

---

## Common footer (appended to every S1 issue body)

> **Before you start:** read [CONTRIBUTING.md](../CONTRIBUTING.md), `CLAUDE.md` §6 (invariants) and the SHIELD.md sections linked above. Comment to be assigned; one open issue per contributor at a time. Respect the issue's **Can start** line (SHIELD.md §0). PRs must say `Closes #<this issue>` and pass `scripts/gates.sh`.
>
> **Shield ground rules (SHIELD.md §7):** rules produce evidence only; nothing outside `assertSignable` decides whether to sign. No rule reads the clock or network directly. Money is `bigint` stroops. No new dependencies without maintainer approval in this issue first.

---

## D0: Shield docs: §11 updates + ADR 0010

Labels: shield, phase:S1, area:docs, maintainer-only · Milestone: Shield S1

**Can start:** after M5 merges (edits docs that M5 changes).

**Context.** SHIELD.md §11, §7 (invariants 15–22), §8 (error codes).

**Scope.** Land the docs before any Shield code, so every later PR is checked against them.

**Files.**
- `CLAUDE.md`: SHIELD.md in the read-before map; invariants 15–22.
- `docs/ROADMAP.md`: replace post-MVP "dapp provider" and "Soroban" with S1–S4 and their exit criteria.
- `docs/PRODUCT.md`, `docs/SECURITY.md` (Shield threats), `docs/ARCHITECTURE.md` (pipeline, `SHIELD_ANALYZE`), `docs/CONVENTIONS.md` §4 (six `SHIELD_*` codes).
- `docs/decisions/0010-stellix-shield.md`: on-device pre-signing analysis; alternatives: remote scanning service, REST backend.

**Acceptance criteria.** Docs merged; `pnpm format:check` passes.

**Depends on.** M5 merged.

**Out of scope.** `PRIVACY.md` changes (each network-reaching issue adds its own).

---

## C1: Core types, rule registry, `analyze()` skeleton, thresholds stub

Labels: shield, phase:S1, area:policy, security-critical, maintainer-only · Milestone: Shield S1

**Can start:** now (core only; the six `SHIELD_*` `errorCopy` entries are the one allowed extension change, per §0).

**Context.** §3.1, §4, §6.3, §6.4.

**Scope.**
- Types: `ShieldRequest`, `Origin`, `ShieldDeps`, `Finding`, `Severity`, `AnalysisReport`, `PolicyDecision`, `DecodedRequest` / `DecodedOperation` (open for the decoder issues to fill), `RuleContext`, `RuleUnavailable`, the closed `RuleId` union, `RULE_SET_VERSION`.
- Rule registry (`rules/index.ts`, ordered) and the `analyze()` orchestrator: decode → rules → report, with `checksUnavailable`. It ships with zero rules.
- `rules/thresholds.ts` with **proposed values for maintainer approval** (§12): `OFFER_BAD_PRICE`, `PATH_LOW_MIN`, `NO_MAX_TIME`, `HIGH_FEE`. Approving them unblocks R4, R5 and R8.
- The six `SHIELD_*` error codes in core (`errors.ts`) and `errorCopy`.

**Files.** `packages/core/src/security/{index.ts,report.ts,types.ts,rules/index.ts,rules/thresholds.ts}`, `packages/core/src/errors.ts`, `apps/extension/src/ui/errorCopy.ts`.

**Acceptance criteria.**
- Types compile under the strict config.
- Unit tests: the registry runs rules in order, and a rule returning `RuleUnavailable` lands in `checksUnavailable`.
- ESLint core restrictions pass, with no platform APIs in `security/`.

**Depends on.** SHIELD.md on `main` (via the onboarding PR). D0 lands after M5, because it edits docs M5 changes; until then SHIELD.md §7 is the reference for the invariants.

**Out of scope.** Digest and `assertSignable` (C2), policy (C3).

---

## C2: Digest binding + `assertSignable`

Labels: shield, phase:S1, area:policy, security-critical, maintainer-only · Milestone: Shield S1

**Can start:** now (`packages/core/src/security/` only).

**Context.** §4 (`assertSignable` conditions), §5 (digest table: transaction and fee-bump rows for S1), invariants 15, 16, 19.

**Scope.**
- Digest computation for transactions and fee-bump transactions.
- `assertSignable` throws a typed `StellixError` on each failed condition: digest, network, rule-set version, expiry, decision state, missing typed confirmation.
- Report expiry: `min(tx maxTime, createdAt + REPORT_TTL)`. The TTL is proposed for approval.

**Files.** `packages/core/src/security/report.ts`, `security/sign-gate.ts` (name TBD), tests.

**Acceptance criteria.**
- One test per failure branch.
- **Mutating any byte of a prepared envelope after analysis fails `assertSignable`** (S1 exit criterion; property-style test over every byte position of a fixture).
- A report built for another network or rule-set version is rejected.

**Depends on.** C1.

**Out of scope.** Auth-entry and SEP-53 digests (S2/S3).

---

## C3: Policy engine + mode matrix

Labels: shield, phase:S1, area:policy, security-critical, maintainer-only · Milestone: Shield S1

**Can start:** now (`packages/core/src/security/` only).

**Context.** §6 intro (highest severity wins, hard blocks independent), §6.1 Policy column, §6.5 matrix, invariants 18–20.

**Scope.** `evaluate(report, policy)` for origins `stellix` and `pasted`, with Mode B's rows present for S2. Covers hard blocks (`overridable: false`), review click/typed, and an unavailable check never yielding `ready`.

**Files.** `packages/core/src/security/policy/{severity.ts,policy.ts}`, tests.

**Acceptance criteria.**
- A critical finding is never outweighed by any number of lower ones.
- A non-overridable block has no path to `ready` or `review` (test enumerates every policy input).
- A rule in `checksUnavailable` forces at least `review`.
- The full matrix is tested per mode.

**Depends on.** C1.

**Out of scope.** UI wording (U1/U2).

---

## T1: Testnet fixture-capture script for every classic op type

Labels: shield, phase:S1, area:tests, help wanted, good first issue · Milestone: Shield S1

**Can start:** now (`scripts/` + core fixtures only).

**Context.** §9 S1 exit ("fixtures captured from testnet for each"), §10.1. The existing pattern is `scripts/capture-horizon-fixtures.mjs`.

**Scope.** A script that builds, signs and submits on **testnet** one transaction per classic op type, using fresh Friendbot accounts. It saves each signed envelope XDR, plus the Horizon transaction record, as fixtures. This covers every op in §9 S1, both offer variants, liquidity-pool deposit and withdraw (create the pool first), and a fee-bump.

**Files.** `scripts/capture-shield-fixtures.mjs`, `packages/core/src/security/__fixtures__/ops/*.json`.

**Acceptance criteria.**
- Running the script regenerates every fixture.
- Each fixture records the op type, the network passphrase and the capture date.
- Fixtures are never hand-written or generated offline (TESTING §1).

**Depends on.** None. Can start right after M5.

**Out of scope.** Decoding the fixtures (D-issues).

---

## D1: Decode envelope + fee-bump

Labels: shield, phase:S1, area:decode, help wanted · Milestone: Shield S1

**Can start:** now (`packages/core/src/security/` only).

**Context.** §3.1 `decode/envelope.ts`, §5 (fee-bump), §6.6.

**Scope.**
- Parse `TransactionEnvelope` and `FeeBumpTransactionEnvelope` from base64 XDR into `DecodedRequest`: source, fee (bigint), sequence, memo, op list, and for a fee bump, the fee source, max fee and inner transaction.
- Reject malformed input with `SHIELD_INPUT_INVALID`.

**Files.** `packages/core/src/security/decode/envelope.ts`, tests.

**Acceptance criteria.**
- Fixtures from T1 decode.
- Malformed, truncated and wrong-type XDR each give `SHIELD_INPUT_INVALID`.
- No `number` for money.

**Depends on.** C1, T1.

**Out of scope.** Per-op decoding.

---

## D2: Decode preconditions

Labels: shield, phase:S1, area:decode, help wanted · Milestone: Shield S1

**Can start:** now (`packages/core/src/security/` only).

**Context.** §3.1 `decode/preconditions.ts`.

**Scope.** `timeBounds`, `ledgerBounds`, `minSeqNum`, `minSeqAge`, `minSeqLedgerGap`, `extraSigners` → typed values. Absent `maxTime` is represented explicitly, for R8.

**Files.** `packages/core/src/security/decode/preconditions.ts`, tests.

**Acceptance criteria.** One fixture per precondition kind (build them in T1 or extend it); each decodes to typed values.

**Depends on.** C1, D1.

**Out of scope.** Judging the values (R8).

---

## D3: Effective source + muxed source resolution

Labels: shield, phase:S1, area:decode, help wanted · Milestone: Shield S1

**Can start:** now (`packages/core/src/security/` only).

**Context.** §6.6.

**Scope.** For each op: effective source = `op.source ?? tx.source`; for a fee bump, the inner transaction's source applies to ops. Resolve `M…` to its base `G…`, and mark ops whose effective source is the user.

**Files.** `packages/core/src/security/decode/sources.ts`, tests.

**Acceptance criteria.** Tests cover: op source absent/present, muxed tx source, muxed op source, fee bump with a different fee source, and the user as op source inside someone else's transaction.

**Depends on.** C1, D1.

**Out of scope.** Rules that use the marking (R2, R3).

---

## D4: Decode payment group

Labels: shield, phase:S1, area:decode, help wanted, good first issue · Milestone: Shield S1

**Can start:** now (`packages/core/src/security/` only).

**Context.** §9 S1 op list.

**Scope.** `createAccount`, `payment`, `pathPaymentStrictReceive`, `pathPaymentStrictSend`, `accountMerge` → `DecodedOperation` variants: assets, amounts as bigint stroops (or asset units), destinations (including muxed), and the path.

**Files.** `packages/core/src/security/decode/operations.ts` (payment section), tests.

**Acceptance criteria.** Each op decodes from its T1 fixture; non-native assets and muxed destinations are covered.

**Depends on.** C1, T1.

---

## D5: Decode DEX group

Labels: shield, phase:S1, area:decode, help wanted · Milestone: Shield S1

**Can start:** now (`packages/core/src/security/` only).

**Scope.** `manageSellOffer`, `manageBuyOffer`, `createPassiveSellOffer`, `liquidityPoolDeposit`, `liquidityPoolWithdraw`. Prices are kept as exact rationals (n/d), never floats.

**Files.** `decode/operations.ts` (DEX section), tests.

**Acceptance criteria.** Each op decodes from its T1 fixture, including offer delete (amount 0) and update (offerId ≠ 0).

**Depends on.** C1, T1.

---

## D6: Decode account-config group

Labels: shield, phase:S1, area:decode, help wanted · Milestone: Shield S1

**Can start:** now (`packages/core/src/security/` only).

**Scope.** `setOptions` (every field: signer add/remove/weight, master weight, thresholds, flags, home domain, inflation dest), `manageData` (set and delete), `bumpSequence`.

**Acceptance criteria.** Each op and each `setOptions` field is covered by a fixture. Signer key types: ed25519, pre-auth tx, hash-x, signed payload.

**Depends on.** C1, T1.

---

## D7: Decode trust/issuer group

Labels: shield, phase:S1, area:decode, help wanted · Milestone: Shield S1

**Can start:** now (`packages/core/src/security/` only).

**Scope.** `changeTrust` (asset and pool-share trustlines, limit 0 = remove), `allowTrust`, `setTrustLineFlags`, `clawback`, `clawbackClaimableBalance`.

**Acceptance criteria.** Each op decodes from its T1 fixture.

**Depends on.** C1, T1.

---

## D8: Decode claimable/sponsorship group

Labels: shield, phase:S1, area:decode, help wanted · Milestone: Shield S1

**Can start:** now (`packages/core/src/security/` only).

**Scope.** `createClaimableBalance` (claimants + predicates, rendered readably), `claimClaimableBalance`, `beginSponsoringFutureReserves`, `endSponsoringFutureReserves`, `revokeSponsorship` (every ledger-entry variant: account, trustline, offer, data, claimable balance, liquidity pool; and the signer variant).

**Acceptance criteria.** Each op and each `revokeSponsorship` variant is covered; nested predicates (and/or/not, time bounds) are decoded.

**Depends on.** C1, T1.

---

## D9: Soroban ops + `inflation` → `UNSUPPORTED_OP` placeholder

Labels: shield, phase:S1, area:decode, help wanted, good first issue · Milestone: Shield S1

**Can start:** now (`packages/core/src/security/` only).

**Context.** §9 S1 ("Soroban op types decode to a minimal 'Soroban operation — analysis arrives in a later version'"), §6.1 `UNSUPPORTED_OP`.

**Scope.**
- `invokeHostFunction`, `extendFootprintTtl`, `restoreFootprint` → a minimal decoded op flagged unsupported.
- Also `inflation` (obsolete since protocol 12 but still decodable by SDK 17).
- The `UNSUPPORTED_OP` rule: one high finding per such op.

**Acceptance criteria.** A test covers each of the four op types; an op type the decoder doesn't know also yields `UNSUPPORTED_OP` (never silently dropped).

**Depends on.** C1.

---

## C4: Mode A: Shield inside `PREPARE_PAYMENT` / `CONFIRM_PAYMENT`

Labels: shield, phase:S1, area:policy, security-critical, maintainer-only · Milestone: Shield S1

**Can start:** after M5 merges (touches `apps/extension/`).

**Context.** §2 Mode A, §5 (composes with ADR 0003), §8, invariant 15.

**Scope.**
- `PREPARE_PAYMENT` runs `analyze` on the built transaction and returns `report`.
- `CONFIRM_PAYMENT` calls `assertSignable` on the stored prepared transaction before signing.
- The existing SEP-29 check is expressed as the `MEMO_REQUIRED` finding (blocked). **The current SEP-29 check in `PREPARE_PAYMENT` stays in place until this issue replaces it, in the same PR.** There is never a commit where neither enforces it.
- The SW wiring lives in `apps/extension/src/background/shield.ts`.

**Acceptance criteria.**
- Existing send tests and E2E still pass.
- New tests: a tampered stored prepared tx is refused; an expired report is refused; `MEMO_REQUIRED` blocks.
- **A test proving the memo-required block holds throughout:** sending to a `config.memo_required` account without a memo is refused before and after the switch. The existing M3 SEP-29 unit test and E2E keep passing unchanged, plus the new Shield-path test.
- `pnpm test:testnet` passes.

**Depends on.** C2, C3, D1, D3, D4.

---

## R9: Copy table: module + completeness test

Labels: shield, phase:S1, area:rules, help wanted, good first issue · Milestone: Shield S1

**Can start:** now (`packages/core/src/security/` only).

**Context.** §3.1 `copy/`, §6.4 (copy keyed by rule ID, placeholders from `evidence`), invariant 17.

**Scope.**
- The `copy/` module and its placeholder filling (missing placeholder → test failure, not a blank).
- Entries for `MEMO_REQUIRED` and `UNSUPPORTED_OP`.
- **A test that every `RuleId` has copy.**

Each rule issue (R1–R8) adds its own entry to this table.

**Acceptance criteria.** The completeness test exists, and fails if a `RuleId` lacks copy. Copy follows the voice in CONVENTIONS and never says "safe" (§1).

**Depends on.** C1.

---

## R1: Rules `ACCT_SIGNER_CHANGE` + `ACCT_MASTER_WEIGHT`

Labels: shield, phase:S1, area:rules, help wanted, security-critical · Milestone: Shield S1 · **Maintainer review required**

**Can start:** now (`packages/core/src/security/` only).

**Context.** §6.1 rows, §6.4, §12 (signer change from a dapp is never overridable).

**Scope.**
- `ACCT_SIGNER_CHANGE`: `setOptions` adding or changing a signer on the user's account (effective source = user).
- `ACCT_MASTER_WEIGHT`: master weight lowered, or thresholds raised so the master key alone can't authorize. Account state comes via `RuleContext`.

**Acceptance criteria.**
- At least one positive and one negative fixture each, including a signer add hidden among payments, and a weight change on *another* account (no finding).
- Copy entries added.

**Depends on.** C1, D3, D6, R9.

---

## R2: Rules `ACCT_MERGE` + `FOREIGN_SOURCE_OP`

Labels: shield, phase:S1, area:rules, help wanted · Milestone: Shield S1

**Can start:** now (`packages/core/src/security/` only).

**Scope.**
- `ACCT_MERGE`: `accountMerge` with the user as effective source.
- `FOREIGN_SOURCE_OP`: an op sourced from the user inside a transaction whose source is another account.

**Acceptance criteria.** Positive and negative fixtures each; a muxed user source is detected. Copy entries added.

**Depends on.** C1, D3, D4, R9.

---

## R3: Rule `UNNAMED_OUTFLOW`

Labels: shield, phase:S1, area:rules, help wanted · Milestone: Shield S1

**Can start:** now (`packages/core/src/security/` only).

**Context.** §6.1 row. Mode B comparison is S2 (§12 open question); in S1, every outflow is listed explicitly.

**Scope.** Every asset leaving the user is listed: payments, path payments, account merge, claimable balances created by the user, and offers as potential outflow. The rule raises a finding when the destination wasn't presented by the requester. In Modes A and C that means: the Send form's destination is "presented", and anything else isn't.

**Acceptance criteria.**
- Positive: a payment to a second address the Send form never showed.
- Negative: the single Send-built payment.
- Copy entry added.

**Depends on.** C1, D3, D4, D8, R9.

---

## R4: Rule `OFFER_BAD_PRICE` + Horizon order-book client

Labels: shield, phase:S1, area:rules, help wanted, blocked · Milestone: Shield S1

**Can start:** now (`packages/core/src/security/` only).

**Context.** §6.1 row, §6.7 (order book, best opposing price; reference unavailable → `RuleUnavailable`), §6.3.

**Scope.**
- A zod-validated `GET /order_book` method on `HorizonClient` (NETWORK §2 conventions, typed errors).
- The rule compares the offer price with the best opposing price using exact rationals, and reports the computed loss in evidence.

**Acceptance criteria.**
- Positive: selling XLM far below market.
- Negative: an at-market offer.
- An unavailable order book gives `RuleUnavailable`.
- Captured Horizon order-book fixture; copy entry added.

**Depends on.** C1, D5, R9; **threshold approved in C1**.

---

## R5: Rule `PATH_LOW_MIN` + Horizon path-finding client

Labels: shield, phase:S1, area:rules, help wanted, blocked · Milestone: Shield S1

**Can start:** now (`packages/core/src/security/` only).

**Context.** §6.1 row, §6.7 (strict-send / strict-receive path finding).

**Scope.**
- `HorizonClient` methods for both path endpoints (zod-validated).
- The rule compares `destMin` / `sendMax` with the best found path and reports the loss.

**Acceptance criteria.** Positive (near-zero `destMin`), negative, and an unavailable path service each covered; captured fixtures; copy entry.

**Depends on.** C1, D4, R9; **threshold approved in C1**.

---

## R6: Rules `TRUST_UNVERIFIED` + `TRUST_CLAWBACK` + `stellar.toml` fetcher

Labels: shield, phase:S1, area:rules, help wanted · Milestone: Shield S1

**Can start:** now (`packages/core/src/security/` only). The `PRIVACY.md` row is drafted in the PR description; the maintainer lands it after M5.

**Context.** §6.1 rows, §6.8 (fetch limits and cache), invariant 21 (new network destination → `PRIVACY.md`).

**Scope.**
- `intel/toml.ts`: only `https://<home_domain>/.well-known/stellar.toml`, 5 s timeout, 100 KB cap, parsed as data only, 1 h session cache keyed per domain. The platform fetch is injected.
- `TRUST_UNVERIFIED`: issuer has no `home_domain`, or its toml doesn't list the asset under `CURRENCIES` with the same issuer.
- `TRUST_CLAWBACK`: issuer has `auth_clawback_enabled`.
- A fetch failure → `RuleUnavailable`, never "malicious".
- **A TOML parser dependency needs maintainer approval in this issue first** (pure JS, zero-dep, at least 14 days old).

**Acceptance criteria.**
- Tests cover oversize body, timeout, http URL refused, redirect handling, a malformed toml, and an asset missing from `CURRENCIES`.
- A draft `PRIVACY.md` row for the maintainer is included.
- Copy entries added.

**Depends on.** C1, D7, R9.

---

## R7: Rules `CLAIMABLE_TO_OTHER` + `SPONSORSHIP_CHANGE`

Labels: shield, phase:S1, area:rules, help wanted, good first issue · Milestone: Shield S1

**Can start:** now (`packages/core/src/security/` only).

**Scope.**
- `CLAIMABLE_TO_OTHER`: `createClaimableBalance` from the user that only others can claim.
- `SPONSORSHIP_CHANGE`: begin/end/revoke sponsorship affecting the user's entries, with the reserve impact in the evidence.

**Acceptance criteria.** Positive and negative fixtures each; copy entries.

**Depends on.** C1, D3, D8, R9.

---

## R8: Rules `NO_MAX_TIME` + `HIGH_FEE`

Labels: shield, phase:S1, area:rules, help wanted, good first issue, blocked · Milestone: Shield S1

**Can start:** now (`packages/core/src/security/` only).

**Scope.**
- `NO_MAX_TIME`: `maxTime` absent (0) or beyond the threshold.
- `HIGH_FEE`: fee bid, or fee-bump max fee, above the threshold, with the max cost in the evidence (bigint stroops).

**Acceptance criteria.** Positive and negative each, including a fee bump with a large max fee; copy entries.

**Depends on.** C1, D1, D2, R9; **thresholds approved in C1**.

---

## U1: Findings UI components

Labels: shield, phase:S1, area:ui, help wanted · Milestone: Shield S1

**Can start:** after M5 merges (touches `apps/extension/`).

**Context.** §3.1 extension `ui/components/findings/`; CONVENTIONS §6.1 design rules; invariants 17–18.

**Scope.**
- A severity badge (text plus icon, never colour alone), a finding list (ordered by severity), and an evidence view.
- A "Checks that couldn't run" section listing `checksUnavailable`, which is never shown as passed.
- All text comes from the copy table.

**Acceptance criteria.**
- Unit tests for ordering and the unavailable section.
- Screenshots of each severity in light and dark attached to the PR.
- No new UI libraries.

**Depends on.** C1, R9.

---

## U2: Analyze screen (Mode C) + `SHIELD_ANALYZE`

Labels: shield, phase:S1, area:ui, help wanted · Milestone: Shield S1

**Can start:** after M5 merges (touches `apps/extension/`).

**Context.** §2 Mode C, §8 `SHIELD_ANALYZE` row (never signs; size-limited), §6.5 Mode C column, CLAUDE.md §6.13.

**Scope.**
- Request type `SHIELD_ANALYZE` with a zod schema, a size limit (`SHIELD_INPUT_TOO_LARGE`) and the usual sender validation.
- Accepts a transaction XDR or a `web+stellar:tx` URI.
- Screen: paste, network selector, report view (U1), and a "Stellix would block this" banner for hard blocks.
- Reachable from Settings or Home (placement agreed in this issue).

**Acceptance criteria.**
- Unit tests for the schema and size limit.
- An E2E test: paste a blocked-case fixture → banner shown → no signing request type is reachable from the screen.
- Never says "safe".

**Depends on.** C1, C3, D1, U1.

---

## U3: Findings on the Send Review screen

Labels: shield, phase:S1, area:ui, help wanted · Milestone: Shield S1

**Can start:** after M5 merges (touches `apps/extension/`).

**Scope.** Render the `report` returned by `PREPARE_PAYMENT` on the existing Review screen with U1 components. Review-typed requires the typed phrase before Confirm is enabled; a block disables Confirm. The SW still enforces this; the UI is not the gate (invariant 15).

**Acceptance criteria.** Existing M3 E2E tests still pass; a new E2E test shows a finding on Review for a crafted case.

**Depends on.** C4, U1.

---

## T2: Classic adversarial corpus

Labels: shield, phase:S1, area:tests, help wanted · Milestone: Shield S1

**Can start:** now (`packages/core/src/security/` only).

**Context.** §10.2 (classic cases), §9 S1 exit ("classic corpus passes"), §10.2 release gate.

**Scope.** `packages/core/src/security/__corpus__/`: each case holds the request XDR (built on testnet where possible), the expected findings and the expected decision per mode (A and C). It covers every classic bullet in §10.2, plus a runner test that fails on any mismatch.

**Acceptance criteria.** All classic cases pass, and no case reaches `ready` without the review or block its rules require.

**Depends on.** C3 and all of R1–R8, D9.

---

## X2: Tracking: Shield S2, injected provider (classic)

Labels: shield, phase:S2, blocked · No milestone

**Context.** SHIELD.md §9 S2, §8 provider rows.

Tracking only. No breakdown until the S2 research and plan are done. **Gate:** ADR for permissions (content-script matches, host access, how the approval window opens), listing what each permission exposes. Blocked on: Shield S1 complete.

## X3: Tracking: Shield S3, Soroban

Labels: shield, phase:S3, blocked · No milestone

**Context.** SHIELD.md §9 S3 (research list: unified/CAP-67 events, SAC interface, `contractspecv0` via `getLedgerEntries`, ledger→time). Tracking only. Blocked on: S2.

## X4: Tracking: Shield S4, mainnet dapp requests

Labels: shield, phase:S4, blocked · No milestone

**Context.** SHIELD.md §9 S4: mainnet RPC provider ADR (same constraints as ADR 0009), signed threat lists, external review. Tracking only. Blocked on: S3, and the external review (docs/SECURITY_REVIEW.md).
