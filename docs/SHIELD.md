# SHIELD.md — Stellix Shield: pre-signing analysis

Stellix Shield is the feature that decodes, simulates, analyzes and gates every transaction or authorization Stellix is asked to sign. It runs entirely on the user's device. This document tells Claude Code what Shield is, how it fits the existing Stellix architecture, what to build in each phase, and which rules are non-negotiable.

Read this together with `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/TRANSACTIONS.md` and `docs/decisions/0003-prepare-confirm-signing.md`. Shield extends those; it does not replace them.

---

## 0. Status and sequencing

- **Boundary while M5 is open:** work confined to `packages/core/src/security/` (plus its fixtures, the corpus and `scripts/`) may start now. That folder is new and isolated from M5's changes. **Anything that touches `apps/extension/`** (Mode A wiring, `SHIELD_ANALYZE`, UI) **or the docs M5 edits** (`CLAUDE.md`, `docs/ROADMAP.md`, `docs/SECURITY.md`, …) **waits until M5 is merged.** Never start Shield code on an M5 branch.
- One exception, text only: a new `ErrorCode` added in core must get its `errorCopy` entry in the same PR (the closed-union completeness test requires it). That is the only `apps/extension/` change allowed before M5 merges.
- Shield is built in four phases (S1–S4, §9). Each phase follows the same process as M0–M5: research, plan, wait for approval, build on a branch, commit per step, no push until told.
- Shield **replaces** these post-MVP ROADMAP items: "dapp provider" and "Soroban". Update `docs/ROADMAP.md` accordingly in the S1 plan (§11).

---

## 1. What Shield is (and is not)

**Is:**
- A module, `packages/core/src/security/`, plus extension UI and messaging that use it.
- Deterministic: rules are pure functions over decoded data, account state and simulation results.
- Explainable: every finding has a rule ID, severity, evidence, and plain-language text.
- Local: no Stellix server. Network calls only to Horizon, Stellar RPC, an asset issuer's own `stellar.toml`, and (S4) a signed threat-list URL.

**Is not:**
- A guarantee. The UI must never say a request is "safe". It says what Shield checked, what it found, and what it couldn't check.
- A REST API or backend service.
- An EVM or multi-chain feature.
- A way to protect signatures made in other wallets (no Stellar wallet exposes a signing hook).
- ML-based.

---

## 2. Delivery modes

| Mode | Source of the request | Can Shield stop the signature? | Phase |
|---|---|---|---|
| A — Stellix-built | Stellix's own Send flow (and future swap/trustline flows) | Yes: runs inside `PREPARE_PAYMENT` / `CONFIRM_PAYMENT` | S1 |
| C — Analyze-only | User pastes a transaction XDR, an auth-entry XDR, or a `web+stellar:tx` URI | No: advisory only, nothing is signed | S1 |
| B — Injected provider | A dapp calls Stellix through SEP-43 | Yes: Stellix is the signer | S2 (classic), S3 (Soroban) |

Mode C ships first because it needs no new permissions and exercises the whole engine.

---

## 3. Architecture

```
Mode A (Send flow) ─┐
Mode B (dapp)  ─────┼──▶ SW router (sender, origin grant, network, zod schema)
Mode C (pasted) ────┘              │
                                   ▼
            packages/core/src/security
            decode ─▶ simulate ─▶ rules ─▶ policy   ◀── reads: Horizon, Stellar RPC,
                                   │                      signed threat lists, issuer stellar.toml
                                   ▼
                     approval UI (popup / review screen)
                                   │ user approves
                                   ▼
            signing handler: assertSignable() ─▶ sign ─▶ submit or return to dapp
```

The analysis core produces **evidence only**. The signing handler in the service worker is the single enforcement point.

### 3.1 Package layout

```
packages/core/src/security/
├── decode/
│   ├── envelope.ts        TransactionEnvelope + FeeBumpTransactionEnvelope
│   ├── operations.ts      every classic op → DecodedOperation (typed union)
│   ├── sources.ts         effective source per op; "spends from user" marking
│   ├── preconditions.ts   timeBounds, ledgerBounds, minSeqNum, minSeqAge, minSeqLedgerGap, extraSigners
│   ├── soroban.ts         invokeHostFunction, extendFootprintTtl, restoreFootprint   (S3)
│   ├── sep41.ts           token call decoding                                       (S3)
│   ├── auth-entry.ts      SorobanAuthorizationEntry + invocation tree               (S3)
│   └── contract-spec.ts   spec from Wasm custom section                              (S3)
├── simulate/
│   ├── rpc-client.ts      Stellar RPC client (zod-validated)                        (S3)
│   └── balance-diff.ts    user balance changes from simulated events               (S3)
├── rules/
│   ├── index.ts           ordered registry, rule-set version constant
│   └── <RULE_ID>.ts       one file per rule, pure function, fixtures beside it
├── policy/
│   ├── severity.ts        Info < Low < Medium < High < Critical
│   └── policy.ts          hard blocks, overrides, decision
├── intel/
│   ├── toml.ts            SEP-1 fetch, parse, cache (with limits, §6.8)
│   └── threat-list.ts     signed list load/verify/expiry                            (S4)
├── report.ts              AnalysisReport, digest computation, expiry
├── copy/                  plain-language text keyed by rule ID (UI reads from here)
└── index.ts               public API: analyze, evaluate, assertSignable
```

`packages/core` rules still apply: no `chrome.*`, no DOM, no Node built-ins, dependencies injected, money as `bigint`.

Extension additions:

```
apps/extension/src/
├── ui/screens/analyze/        Mode C: paste + report view                (S1)
├── ui/components/findings/    finding list, severity badges, diff view   (S1)
├── background/shield.ts       SW handlers wiring core/security           (S1)
├── entrypoints/content.ts     relay only                                 (S2)
├── provider/                  injected SEP-43 API                        (S2)
└── ui/screens/approval/       dapp approval popup                        (S2)
```

---

## 4. Core interfaces

```ts
export type ShieldRequest =
  | { kind: "transaction"; xdr: string; network: NetworkId; origin: Origin }
  | { kind: "authEntry";   xdr: string; network: NetworkId; origin: Origin }   // S3
  | { kind: "message";     message: string; network: NetworkId; origin: Origin }; // S2, SEP-53

export type Origin =
  | { type: "stellix" }                 // Mode A
  | { type: "pasted" }                  // Mode C
  | { type: "dapp"; url: string };      // Mode B

export interface ShieldDeps {
  horizon: HorizonClient;              // existing
  rpc?: StellarRpcClient;              // S3; absent → Soroban simulation is "unavailable"
  toml: TomlFetcher;
  threatLists?: ThreatListStore;       // S4
  userAccount: string;                 // active G… address
  now(): number;
}

export function analyze(req: ShieldRequest, deps: ShieldDeps): Promise<AnalysisReport>;
export function evaluate(report: AnalysisReport, policy: Policy): PolicyDecision;
export function assertSignable(req: ShieldRequest, report: AnalysisReport, decision: PolicyDecision, now: number): void; // throws StellixError
```

```ts
export type Severity = "info" | "low" | "medium" | "high" | "critical";

export interface Finding {
  ruleId: RuleId;                      // closed union, e.g. "ACCT_SIGNER_CHANGE"
  severity: Severity;
  confidence: "high" | "medium" | "low";
  opIndex?: number;                    // which operation, if any
  evidence: Record<string, string>;    // public values only, units in key names
}

export interface AnalysisReport {
  digest: string;                      // hex; see §5
  network: NetworkId;
  ruleSetVersion: string;
  decoded: DecodedRequest;
  simulation: SimulationResult | { status: "not_applicable" } | { status: "unavailable"; reason: string };
  findings: Finding[];
  checksUnavailable: RuleId[];         // rules that could not run (e.g. no RPC, toml timeout)
  createdAt: number;
  expiresAt: number;                   // min(tx maxTime, createdAt + REPORT_TTL)
}

export type PolicyDecision =
  | { state: "ready" }
  | { state: "review"; requires: "click" | "typed"; typedPhrase?: string }
  | { state: "blocked"; ruleIds: RuleId[]; overridable: false };
```

`assertSignable` throws unless **all** hold: recomputed digest equals `report.digest`; network matches; `report.ruleSetVersion` equals the current constant; `now < report.expiresAt`; decision is `ready`, or `review` with the required confirmation recorded. A report produced anywhere else is never accepted.

---

## 5. Digest binding

| Request | Digest |
|---|---|
| Transaction | `tx.hash()` — `sha256(networkId ‖ ENVELOPE_TYPE_TX ‖ tx)`; covers fee, sequence, preconditions, memo, all ops |
| Fee-bump transaction | The fee-bump transaction hash (covers fee source, max fee and the inner transaction) |
| Soroban auth entry | `sha256(HashIdPreimage ENVELOPE_TYPE_SOROBAN_AUTHORIZATION { networkId, nonce, signatureExpirationLedger, invocation })` |
| SEP-53 message | The SEP-53 message hash |

Any change to the request after analysis → digest mismatch → `SHIELD_DIGEST_MISMATCH` → back to decoding.

For Mode A, this composes with ADR 0003: the prepared transaction's hash is the digest, and `CONFIRM_PAYMENT` calls `assertSignable` before signing.

---

## 6. Rule catalogue

Severity = highest finding wins. Never average. Hard blocks are independent of severity math.

### 6.1 Classic — S1

| Rule ID | Detects | Severity | Policy |
|---|---|---|---|
| `ACCT_SIGNER_CHANGE` | `setOptions` on the user's account adding/changing a signer | critical | Mode B: **blocked, not overridable**. Mode A: n/a (Stellix never builds it). Mode C: report only. |
| `ACCT_MASTER_WEIGHT` | `setOptions` lowering master weight or raising thresholds such that the master key alone can no longer authorize | critical | Blocked, not overridable |
| `ACCT_MERGE` | `accountMerge` with the user as effective source | critical | Blocked unless Origin is `stellix` |
| `FOREIGN_SOURCE_OP` | An op whose effective source is the user inside a transaction whose source is another account | high | Review, typed |
| `UNNAMED_OUTFLOW` | Assets leave the user to an address not presented by the requester (Mode B: compared with the dapp's stated destinations if given; otherwise every outflow is listed explicitly) | high | Review, typed |
| `OFFER_BAD_PRICE` | `manageSellOffer` / `manageBuyOffer` / `createPassiveSellOffer` priced worse than the order-book reference by more than the threshold | high | Review, show computed loss |
| `PATH_LOW_MIN` | Path payment whose `destMin` / `sendMax` implies loss beyond threshold vs Horizon's best path | high | Review, show computed loss |
| `CLAIMABLE_TO_OTHER` | `createClaimableBalance` from the user claimable only by others | medium | Review |
| `TRUST_UNVERIFIED` | `changeTrust` to an asset whose issuer has no `home_domain`, or whose `stellar.toml` doesn't list the asset under `CURRENCIES` with the same issuer | medium | Review |
| `TRUST_CLAWBACK` | Issuer has `auth_clawback_enabled` | medium | Review, explain |
| `SPONSORSHIP_CHANGE` | Begin/end/revoke sponsorship affecting the user's entries | medium | Review, explain reserve impact |
| `NO_MAX_TIME` | `maxTime` absent (0) or beyond threshold | medium | Review |
| `HIGH_FEE` | Fee bid, or fee-bump max fee, above threshold | medium | Review, show max cost |
| `MEMO_REQUIRED` | Existing SEP-29 check | high | Blocked (existing behaviour) |
| `UNSUPPORTED_OP` | An op type the decoder doesn't render | high | Review, typed; never silently shown |

### 6.2 Soroban — S3

| Rule ID | Detects | Severity | Policy |
|---|---|---|---|
| `SIM_FAILED` | Simulation returned an error | high | Review, typed |
| `SIM_UNAVAILABLE` | RPC unreachable / timed out / invalid response | high | Review, typed; shown as "Simulation unavailable", never safe |
| `SIM_OUTFLOW` | Simulation shows the user's balance decreasing for an asset or amount not presented | high | Review, show diff |
| `TOKEN_APPROVE_LARGE` | SEP-41 `approve` with amount > user balance × threshold, or near `i128` max | high | Review; show spender, amount, expiry as approximate date |
| `TOKEN_APPROVE_LONG` | `approve` whose `expiration_ledger` is beyond threshold | medium | Review |
| `AUTH_TREE_UNNAMED` | An auth entry whose invocation tree reaches a contract or function not presented | critical | Blocked, not overridable |
| `AUTH_LONG_EXPIRY` | Auth entry `signatureExpirationLedger` beyond threshold | high | Review |
| `AUTH_ANY_SUBMITTER` | Any auth-entry signing | info | Always shown: whoever holds it can submit it |
| `UNKNOWN_CONTRACT` | No readable spec, not a Stellar Asset Contract, no list entry | info | Shown as unknown, not malicious |

### 6.3 Thresholds

All thresholds live in `rules/thresholds.ts`, versioned with the rule set. Initial values are proposed in the S1/S3 plans for approval — do not hardcode values in rule files.

### 6.4 Rule implementation rules

- One file per rule. Signature: `(ctx: RuleContext) => Finding[] | RuleUnavailable`.
- A rule that needs data it can't get returns `RuleUnavailable`; the rule ID goes in `checksUnavailable` and the UI shows it.
- No rule reads the clock or network directly; everything comes via `RuleContext`.
- Every rule has ≥ 1 positive and ≥ 1 negative fixture.
- User-facing text lives in `copy/`, keyed by rule ID, with placeholders filled from `evidence`.

### 6.5 Mode-specific policy matrix

| Policy outcome | Mode A (stellix) | Mode B (dapp) | Mode C (pasted) |
|---|---|---|---|
| Blocked, not overridable | Block | Block | Show "Stellix would block this" |
| Review, typed | Typed confirm | Typed confirm | Show finding |
| Review, click | Explicit confirm | Explicit confirm | Show finding |

### 6.6 Effective source

`op.source ?? tx.source`. For fee bumps, the inner transaction's source applies to ops; the fee source pays the fee. An op is "from the user" if its effective source's base account equals the user's `G…` (decode muxed sources).

### 6.7 Price references (S1)

- Offers: Horizon order book for the pair (`GET /order_book`), best opposing price.
- Path payments: Horizon `strict-send` / `strict-receive` path finding for the same assets/amount.
- Reference unavailable → `RuleUnavailable`, not a pass.

### 6.8 `stellar.toml` fetching

- `https://<home_domain>/.well-known/stellar.toml` only. No other paths, no http.
- Timeout 5 s; max body 100 KB; parse as TOML data only.
- Cache per domain in session storage, 1 h.
- A fetch failure → `TRUST_UNVERIFIED` returns `RuleUnavailable` with reason, not a finding of "malicious".
- Add a TOML parser only if it's pure JS, zero-dep, ≥ 14 days old; justify in the plan.

---

## 7. Invariants (append to CLAUDE.md §6 as 15–22)

15. Shield output is evidence. Only `assertSignable` inside the SW signing handler authorizes a signature.
16. Analysis never modifies a transaction or auth entry.
17. Text supplied by a dapp is never displayed as Stellix's own analysis.
18. An unavailable or failed check is never displayed as safe, and never yields `ready` without review.
19. Non-overridable blocks have no override path in any UI or message type. Tests must prove it.
20. Highest severity wins; findings are never averaged.
21. New network destinations are limited to: configured Horizon, configured Stellar RPC (S3), issuers' `stellar.toml` (§6.8), the threat-list URL (S4). Each is listed in `PRIVACY.md`.
22. No analytics. Metrics come from test corpora (§10.3).

---

## 8. Messaging additions

| Type | Payload | Returns | Phase | Notes |
|---|---|---|---|---|
| `SHIELD_ANALYZE` | `{ input: string; network }` (XDR or `web+stellar:tx` URI) | `AnalysisReport` (public data) | S1 | Mode C. Never signs. Size-limited input. |
| `PREPARE_PAYMENT` | unchanged | adds `report` to the result | S1 | Mode A runs `analyze` on the built tx |
| `CONFIRM_PAYMENT` | unchanged | unchanged | S1 | calls `assertSignable` before signing |
| Provider request types | SEP-43 methods | per SEP-43 | S2/S3 | separate ADR; content-script origin |

New error codes (add to CONVENTIONS §4 and `errorCopy`): `SHIELD_DIGEST_MISMATCH`, `SHIELD_REPORT_EXPIRED`, `SHIELD_BLOCKED`, `SHIELD_CONFIRMATION_REQUIRED`, `SHIELD_INPUT_INVALID`, `SHIELD_INPUT_TOO_LARGE`.

---

## 9. Phases

### S1 — Classic analysis, Modes A and C

Build:
- `decode/` for every classic op type: createAccount, payment, pathPaymentStrictReceive, pathPaymentStrictSend, manageSellOffer, manageBuyOffer, createPassiveSellOffer, setOptions, changeTrust, allowTrust, accountMerge, manageData, bumpSequence, createClaimableBalance, claimClaimableBalance, beginSponsoringFutureReserves, endSponsoringFutureReserves, revokeSponsorship, clawback, clawbackClaimableBalance, setTrustLineFlags, liquidityPoolDeposit, liquidityPoolWithdraw. Soroban op types decode to a minimal "Soroban operation — analysis arrives in a later version" with `UNSUPPORTED_OP`. Verify the op list against the current SDK before starting.
- Fee-bump and precondition decoding.
- Rules in §6.1, thresholds file, policy, report, `assertSignable`.
- Mode A: analysis inside `PREPARE_PAYMENT`; `assertSignable` inside `CONFIRM_PAYMENT`. Findings shown on the existing Review screen.
- Mode C: Analyze screen (paste, network selector, report view, "Stellix would block this" banner).
- Findings UI components shared by both.
- Adversarial corpus for classic cases (§10.2).

Exit:
- Every classic op type decodes to plain language (fixtures captured from testnet for each).
- All §6.1 rules have positive + negative fixtures; classic corpus passes.
- Mutating any byte of a prepared tx after analysis fails `assertSignable` (test).
- No new manifest permissions.

### S2 — Injected provider (classic)

Build: content script (relay only), injected SEP-43 provider, per-origin grants, approval popup window, request queue (one per origin), SEP-53 `signMessage`, provider adversarial tests. `signAuthEntry` returns "not supported yet" until S3.

Gate before code: **ADR for permissions** (content-script matches, host access, how the approval window is opened) listing what each permission exposes.

Exit: provider tests (origin validation, malformed/oversized payloads, wrong network, concurrent requests) pass; every classic corpus case behaves identically in Mode B.

### S3 — Soroban

Build: RPC client (`simulateTransaction`, `getLedgerEntries`, `getLatestLedger`, `getNetwork` with passphrase check), Soroban op decoding, contract spec reading, SEP-41 decoding, balance diff from simulated events, auth-entry decoding, §6.2 rules, `signAuthEntry` in the provider.

Research first (in the S3 plan): current Soroban event format after recent protocol changes (unified/CAP-67 events), Stellar Asset Contract interface, how to read the Wasm `contractspecv0` section via `getLedgerEntries`, and approximate ledger-to-time conversion for expiry display.

Exit: simulated diffs match post-submit balances on testnet; Soroban corpus passes; `AUTH_TREE_UNNAMED` cannot be overridden.

### S4 — Mainnet for dapp requests

Build: mainnet RPC provider choice (ADR, same constraints as ADR 0009: no secret key, CORS for extension origins), signed threat lists (format, signing key custody, verification, expiry), external security review of Shield + provider, release.

Exit: review findings resolved or risk-accepted in writing; mainnet dapp signing enabled behind the existing `MAINNET_ENABLED` flag.

---

## 10. Testing

### 10.1 Unit
Decoder fixtures per op type; effective-source cases including muxed; preconditions; each rule positive/negative; policy (critical never outweighed, non-overridable has no path); digest tamper tests; `assertSignable` each failure branch; copy table has text for every rule ID.

### 10.2 Adversarial corpus (`packages/core/src/security/__corpus__/`)
Each case: request XDR + expected findings + expected decision, per mode.
- Payments mixed with a `setOptions` signer add.
- User-sourced op hidden among dapp-sourced ops.
- `accountMerge` with harmless-looking payments.
- Offer selling XLM far below market.
- Path payment with near-zero `destMin`.
- `changeTrust` to unverified issuer; to clawback-enabled issuer.
- No `maxTime`.
- Fee bump with large max fee.
- Unsupported op type.
- (S2) malformed provider payloads, oversized XDR, wrong network, origin spoofing attempts.
- (S3) auth tree with an extra token `transfer`; `approve` near `i128` max with far expiry; simulation success with unexpected outflow; RPC returning malformed data.

Release gate per phase: every corpus case for that phase yields its expected finding and decision; no case reaches `ready` without the review or block its rules require.

### 10.3 Metrics (no telemetry)
CI reports detection per rule category on the corpus, false positives on a benign corpus of real testnet dapp transactions, and analysis latency p50/p95 in the SW on a reference run.

---

## 11. Doc updates the S1 plan must include

- `CLAUDE.md`: add `docs/SHIELD.md` to the read-before map; append invariants 15–22.
- `docs/ROADMAP.md`: replace post-MVP "dapp provider" and "Soroban" with S1–S4 and their exit criteria.
- `docs/PRODUCT.md`: add Shield to the feature list and principles.
- `docs/SECURITY.md`: add Shield threats (dapp summary spoofing, simulation manipulation, hostile toml, report replay).
- `docs/ARCHITECTURE.md`: add the Shield pipeline and new request types.
- `docs/CONVENTIONS.md` §4: new error codes.
- `PRIVACY.md`: new network destinations as each phase adds them.
- ADR 0010: "Stellix Shield: on-device pre-signing analysis" (decision, alternatives: remote scanning service; REST backend).

---

## 12. Open questions to raise in plans (don't guess)

- Thresholds for `OFFER_BAD_PRICE`, `PATH_LOW_MIN`, `NO_MAX_TIME`, `HIGH_FEE`, `TOKEN_APPROVE_*`, `AUTH_LONG_EXPIRY`.
- Whether `ACCT_SIGNER_CHANGE` from a dapp should ever be overridable (current answer: no).
- Mode B outflow comparison: what counts as "presented" when a dapp supplies no destinations.
- Threat-list sources, maintainer, signing-key custody (S4).
- Mainnet RPC provider (S4).