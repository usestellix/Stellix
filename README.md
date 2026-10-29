# Stellix Shield

**See what you sign on Stellar.**

Stellix is a non-custodial Stellar wallet built around **Shield**, an analysis engine that runs on
your device before every signature. Shield decodes a transaction into plain language, checks it for
known account-takeover, drain and loss patterns, and decides whether Stellix will sign it, asks you
to confirm first, or refuses. Nothing is sent to a scanning service, and Stellix runs no servers.

> **Status: 0.1.0, testnet only.** Stellix isn't on the Chrome Web Store yet, and mainnet is
> turned off in every build until an external security review is done
> ([ADR 0008](docs/decisions/0008-testnet-only-builds.md)). Shield is part-way through its first
> stage: see [Where Shield is today](#where-shield-is-today). Don't use Stellix with mainnet keys or
> real funds.

Stellix is not affiliated with the Stellar Development Foundation.

---

## Contents

- [Why Shield](#why-shield)
- [How Shield works](#how-shield-works)
- [What Shield checks](#what-shield-checks)
- [How Shield decides](#how-shield-decides)
- [Shield's rules](#shields-rules)
- [What Shield is not](#what-shield-is-not)
- [Where Shield is today](#where-shield-is-today)
- [The wallet](#the-wallet)
- [Keys and custody](#keys-and-custody)
- [Privacy](#privacy)
- [Run it from source](#run-it-from-source)
- [Repository](#repository)
- [Testing](#testing)
- [Releases](#releases)
- [Contributing](#contributing)
- [Reporting a vulnerability](#reporting-a-vulnerability)
- [License](#license)

---

## Why Shield

On Stellar, signing is the risky moment, and there's no undo:

- **One transaction can do many things.** A transaction can hold up to 100 operations. A site can
  show you "Claim your 5 XLM reward" while the transaction it asks you to sign also adds a new
  signer to your account, which hands control of it to someone else.
- **Operations can act for other accounts.** Each operation can name its own source account, so a
  harmless-looking transaction from a site can still spend from yours.
- **Most wallets show the raw transaction, or the site's own description of it.** Neither tells
  you what the transaction will actually do to your account.

Shield reads the transaction itself, not what anyone says about it, and tells you what it does
before you sign.

## How Shield works

```
Your request ──▶ decode ──▶ gather ──▶ rules ──▶ policy ──▶ review screen
                                                                 │ you confirm
                                                                 ▼
                                    service worker: assertSignable ──▶ sign ──▶ submit
```

1. **Decode.** Every classic Stellar operation, fee bumps and preconditions (time bounds,
   sequence rules, extra signers) are decoded into plain language. Muxed (`M…`) accounts are
   resolved to their base account, and each operation's effective source is worked out, so Shield
   knows which operations act on *your* account.
2. **Gather.** Shield reads what its rules need: your account's signers and thresholds, the order
   book and best paths from Horizon, and, for new trustlines, the asset issuer's own
   `stellar.toml`.
3. **Rules.** Each rule is a small, deterministic function that either reports findings with
   evidence or says it couldn't run and why. No machine learning, no remote scoring.
4. **Policy.** The findings become one decision: **ready**, **confirm with a click**, **confirm
   by typing `CONFIRM`**, or **blocked**. The strictest finding wins.
5. **Enforce.** The analysis is evidence only. A single check in the background service worker,
   `assertSignable`, decides whether a signature is allowed. It re-checks the decision against the
   stored analysis and the transaction's hash, so a transaction that changes by one byte after
   analysis is refused and has to be analyzed again.

Shield works in three modes:

| Mode | Where the request comes from | Can Shield stop the signature? | Stage |
|---|---|---|---|
| **A, Stellix-built** | Stellix's own Send flow | Yes, inside the service worker before signing | S1 |
| **C, Analyze** | You paste a transaction or a `web+stellar:tx` link, for instance one you'll sign in another wallet | No: it shows what Stellix would do, and nothing is signed | S1 |
| **B, Dapp request** | A Stellar dapp asks Stellix to sign (SEP-43) | Yes: Stellix is the signer | S2, S3 |

## What Shield checks

| Pattern | What Shield looks for |
|---|---|
| **Account takeover** | A new signer on your account, or a change that leaves your own key unable to authorize anything. |
| **Draining your account** | Merging your account into another, money leaving to an address you weren't shown, operations on your account hidden in someone else's transaction. |
| **Bad trades** | Offers priced far below the order book, and path payments that accept far less than the best route. |
| **Risky assets** | Trustlines to issuers that don't list the asset in their own `stellar.toml`, and issuers that can claw funds back. |
| **Hidden costs and long-lived signatures** | Unusually high fees, sponsorship changes that move reserves onto you, and transactions that stay valid for over an hour, so anyone holding them could submit them later. |
| **Exchange deposits** | Payments to an exchange account that requires a memo, sent without one (SEP-29). |
| **Anything unrecognized** | An operation the decoder can't render is never hidden: it needs a typed confirmation. |

From stage S3, Shield also simulates Soroban contract calls and decodes authorizations and token
approvals.

## How Shield decides

- **The strictest finding wins.** Ready < click < typed < blocked. Findings are never averaged, so
  a critical finding can't be outweighed by harmless ones.
- **Severity sets a floor.** Critical findings need at least a typed confirmation; medium and high
  need at least a click.
- **Some blocks have no override.** A dapp adding a signer to your account or taking your own key
  out of control, and a payment missing a required memo, are refused outright. No screen and no
  message type can sign them. Tests try every combination of rules, fired and unavailable, in
  every mode to prove it.
- **A check that can't run is never treated as a pass.** If Horizon is down or an issuer's
  `stellar.toml` can't be read, Shield says which check couldn't run and why, and treats it as if
  the rule had fired. Breaking a check on purpose can't get a transaction past it.
- **Shield's text is Shield's own.** A dapp's description of its request is never shown as
  Stellix's analysis.
- **An analysis expires after 5 minutes** and is tied to the exact transaction hash it analyzed.

## Shield's rules

The stage S1 rules for classic transactions. Thresholds are in
[`rules/thresholds.ts`](packages/core/src/security/rules/thresholds.ts) and are versioned with the
rule set.

| Rule | Detects | Severity | Outcome |
|---|---|---|---|
| `ACCT_SIGNER_CHANGE` | A signer added to your account, or its weight changed | critical | Blocked, no override |
| `ACCT_MASTER_WEIGHT` | Changes that leave your own key unable to authorize your account | critical | Blocked, no override |
| `ACCT_MERGE` | Your account merged into another | critical | Blocked, except a merge Stellix itself built, which needs a typed confirmation |
| `MEMO_REQUIRED` | A payment or merge to an account that requires a memo, without one (SEP-29) | high | Blocked, no override |
| `FOREIGN_SOURCE_OP` | An operation on your account inside a transaction from another account | high | Typed confirmation |
| `UNNAMED_OUTFLOW` | Money leaving your account to an address you weren't shown | high | Typed confirmation |
| `UNSUPPORTED_OP` | An operation the decoder doesn't render | high | Typed confirmation |
| `OFFER_BAD_PRICE` | An offer more than 5% worse than the best order-book price, with the possible loss | high | Confirmation |
| `PATH_LOW_MIN` | A path payment that allows more than 5% loss against the best route | high | Confirmation |
| `CLAIMABLE_TO_OTHER` | A claimable balance from you that you can't claim back | medium | Confirmation |
| `TRUST_UNVERIFIED` | A trustline to an asset its issuer's `stellar.toml` doesn't list | medium | Confirmation |
| `TRUST_CLAWBACK` | A trustline to an issuer that can claw funds back | medium | Confirmation |
| `SPONSORSHIP_CHANGE` | Sponsorship changes and the reserves they move | medium | Confirmation |
| `NO_MAX_TIME` | No expiry, or one more than an hour away | medium | Confirmation |
| `HIGH_FEE` | A maximum fee above 0.1 XLM | medium | Confirmation |

Every rule has positive and negative fixtures captured from testnet. The full catalogue, the
Soroban rules planned for S3, and the reasoning behind each outcome are in
[SHIELD.md](docs/SHIELD.md) §6.

## What Shield is not

- **Not a guarantee.** Shield shows what it checked, what it found and what it couldn't check. It
  never calls a request "safe". It flags known patterns; a new kind of attack may not match any
  rule.
- **Not a backend.** There's no Stellix server and no scanning API. Shield only talks to the
  Horizon server you've configured, issuers' own `stellar.toml` files, and in later stages a
  Stellar RPC server and a signed threat list.
- **Not a shield for other wallets.** No Stellar wallet lets another one stop its signatures. The
  Analyze screen tells you what a transaction does, but Shield can only refuse to sign in Stellix.
- **Not machine learning.** Rules are fixed, deterministic and explainable: every finding has a
  rule ID, a severity, evidence and plain-language text.

## Where Shield is today

| Stage | Scope | State |
|---|---|---|
| **S1** | Classic transactions: decode every operation, check every send (Mode A), the Analyze screen (Mode C) | **In progress.** The decoder, all S1 rules, the policy engine and `assertSignable` are merged, and every send from Stellix is analyzed and checked before signing. Showing findings on the review screen (#36) and the Analyze screen (#35) are still open. Until #36 lands, a send that needs a confirmation is refused rather than signed. |
| **S2** | Requests from Stellar dapps, each analyzed before you see it | Not started |
| **S3** | Soroban: simulated contract calls, balance changes, decoded authorizations and token approvals | Not started |
| **S4** | Dapp signing on mainnet, signed threat lists, an external security review of Shield | Not started |

See [ROADMAP.md](docs/ROADMAP.md) for each stage's exit criteria.

---

## The wallet

Shield sits inside a complete XLM wallet.

**Keys and accounts**
- Create a wallet with a 12-word recovery phrase, shown once in a full browser tab so the popup
  can't close while you write it down, then checked before you continue.
- Import a 12- or 24-word phrase. Stellix finds the same accounts as other standard (SEP-0005)
  Stellar wallets.
- Several accounts from one phrase, each with its own name.
- Locks after 5 to 60 minutes of inactivity and when the browser closes. Change your password,
  reveal your phrase with your password, or reset the wallet.

**Balances**
- Total, available and reserved XLM, with an explanation of what's reserved.
- A new account's unfunded state, explained. On testnet, a **Fund with Friendbot** button.

**Send**
- XLM to any `G…` or `M…` address. Stellix picks between activating a new account and a plain
  payment.
- **Max** keeps the reserve and the fee aside, so a payment can't take your account below its
  minimum.
- The review screen shows the full destination in groups of four characters, the amount, memo,
  fee and network, all read from the built transaction.
- Warns the first time you send to an address, and stops you if you paste a secret key where an
  address belongs.
- Payments are submitted once and then tracked by hash, never blindly resent. Every transaction
  expires after 180 seconds.

**Receive and activity**
- Your address as text, a QR code and a SEP-7 payment link.
- Incoming and outgoing history, updated live while the wallet is open.

**Network**
- The current network is always visible. Choose your own Horizon server in Settings.

## Keys and custody

Stellix is non-custodial: only you hold your keys.

- Your recovery phrase is created on your device and stored in an encrypted vault: AES-256-GCM
  with a key derived from your password by scrypt.
- The phrase and keys exist in plaintext only inside the extension's background service worker,
  only while an operation runs. The popup never receives them.
- While unlocked, the derived key sits in the browser's in-memory session storage, which the
  browser clears when it closes.
- The service worker builds every transaction and signs only the transaction you reviewed. It
  checks the network before every signature.
- The extension asks for two permissions, `storage` and `alarms`. No host permissions, no content
  scripts, no remote code, no `eval`.

If you lose both your password and your recovery phrase, your funds can't be recovered. Nobody,
including us, holds a copy. The threat model is in [SECURITY.md](docs/SECURITY.md).

## Privacy

Stellix collects nothing: no accounts, analytics, telemetry or crash reports. The wallet talks
directly to:

- **A Stellar Horizon server**, by default the Stellar Development Foundation's. Its operator can
  see your IP address and the account addresses you use.
- **Friendbot**, only when you fund a testnet account.
- **An asset issuer's `stellar.toml`**, only when Shield checks a trustline to that asset.

Details are in [PRIVACY.md](PRIVACY.md).

---

## Run it from source

Requirements: Node `24.19.0` (`.nvmrc`) and pnpm `11.24.0` (`corepack enable` provides it).

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Open `chrome://extensions`, turn on **Developer mode**, choose **Load unpacked** and select
`apps/extension/.output/chrome-mv3-dev`. Create a wallet and fund it with **Fund with Friendbot**.

| Command | What it does |
|---|---|
| `pnpm dev` | The extension with hot reload |
| `pnpm build` | Production build, testnet only unless `STELLIX_MAINNET_ENABLED=true` |
| `pnpm zip` | Store-ready zip |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:testnet` | Integration tests against the Stellar testnet |
| `pnpm test:e2e` | Playwright against the built extension |
| `pnpm test:e2e:mainnet` | The mainnet E2E specs against a mainnet-enabled build |
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check` | Static checks |
| `scripts/gates.sh` | Format, typecheck, lint, no-console check and unit tests, stopping at the first failure |

## Repository

```
packages/core/            Platform-free wallet logic in TypeScript
  src/security/           Shield: decode, gather, rules, policy, report, assertSignable
  src/keys/  src/vault/   Recovery phrase, SEP-0005 derivation, encrypted vault
  src/tx/    src/network/ Transaction building, Horizon client, network config
  src/history/ src/uri/   Activity history, SEP-7 links
  src/services/           Onboarding, unlock, send: what the extension calls
apps/extension/           The Chrome MV3 extension (WXT + React)
  src/background/         Service worker: the only holder of secrets, the signing handlers
  src/ui/                 Popup and onboarding screens, Shield findings components
stellix-demo/             The website (Next.js, static export)
docs/                     Design docs, the source of truth for behaviour
docs/decisions/           Architecture decision records
scripts/                  Fixture capture, release and CI checks
```

`packages/core` never touches `chrome.*`, the DOM, React or Node built-ins, so a later mobile app
can reuse it unchanged ([MOBILE_MIGRATION](docs/MOBILE_MIGRATION.md)).

Where to start reading: [PRODUCT](docs/PRODUCT.md), [ARCHITECTURE](docs/ARCHITECTURE.md),
[SHIELD](docs/SHIELD.md), [STELLAR_PRIMER](docs/STELLAR_PRIMER.md), then the doc for the area
you're working on (the map is in [CLAUDE.md](CLAUDE.md) §2). Past decisions, including
[why Shield exists](docs/decisions/0010-stellix-shield.md), are in
[docs/decisions](docs/decisions/).

## Testing

- **Unit tests** for every decoder, rule, policy outcome and `assertSignable` failure path,
  including tamper tests that change a prepared transaction after analysis.
- **Real data only.** Horizon and Shield fixtures are captured from testnet by scripts in
  `scripts/`, never written by hand. SEP-0005 and SLIP-0010 test vectors are copied from the
  published specs.
- **An adversarial corpus** of attack transactions (signer adds hidden among payments, merges
  dressed up as payments, near-zero path minimums, and more), each with the finding and decision
  Shield must produce. A **benign corpus** of real testnet transactions measures false positives.
  CI reports both, with no telemetry from users.
- **Testnet integration tests** and **Playwright end-to-end tests** against the built extension.
- **CI** also scans the full git history for committed secrets, and checks that release builds
  are reproducible.

## Releases

Releases are built in CI, reproducibly, and published as GitHub releases with their SHA-256
hashes. [VERIFY_RELEASE](docs/VERIFY_RELEASE.md) shows how to check that the copy the Chrome Web
Store serves matches a release.

Only install Stellix from the official Chrome Web Store listing, once it's published. Stellix is
never offered as a file to download, and nobody from Stellix will ask for your recovery phrase.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) first. In short: pick a `help wanted` issue and ask to be
assigned, keep to the invariants in [CLAUDE.md](CLAUDE.md) §6, and make sure `scripts/gates.sh` and
CI pass. Code that decides whether to sign (the policy engine, `assertSignable`, the signing
handlers) is maintainer-only.

## Reporting a vulnerability

Don't open a public issue. Use **Report a vulnerability** on the repository's Security tab. See
[INCIDENT_RESPONSE](docs/INCIDENT_RESPONSE.md).

## License

[Apache-2.0](LICENSE)
