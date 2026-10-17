# External security review

The ROADMAP M5 requirement: an external review of key management, the vault, transaction building/signing, and the service-worker message handler **before mainnet ships in a public release**. 0.1.0 is testnet-only (ADR 0008), so the review gates the first mainnet-enabled build, not 0.1.0.

## Scope

| Area | Code | What reviewers should focus on |
|---|---|---|
| Keys | `packages/core/src/keys/` | BIP39 generation and parsing; SEP-0005 / SLIP-0010 derivation (tested against the published vectors); no secret in errors or logs |
| Vault | `packages/core/src/vault/` | scrypt parameters and bounds (ADR 0005); AES-GCM with header AAD; IV/salt freshness; re-encryption; downgrade or tamper attempts |
| Session | `packages/core/src/services/session.ts`, `secrets.ts` | Session key only in `chrome.storage.session` (CLAUDE.md §6.4); lock, auto-lock, unlock throttle; reveal and change password |
| Transactions | `packages/core/src/tx/`, `services/send.ts` | The summary decoded from the built transaction (§6.6); network passphrase assertion (§6.7); bigint money (§6.8); timebounds (§6.10); async submit and resolve-by-hash, no blind resubmission (§6.9, ADR 0007); the double-send guards |
| Message handler | `apps/extension/src/messaging/`, `src/background/` | Sender checks and zod validation on every message (§6.13); onboarding-only request types; which data each context can reach (§6.1–6.5); serial queue; startup and migrations |
| Build and release | `wxt.config.ts`, `.github/workflows/`, `scripts/check-*.mjs`, `scripts/verify-store-package.mjs` | Manifest permissions and CSP (§6.11–6.12); dependency policy (SECURITY §8); reproducibility; the MAINNET_ENABLED gate (ADR 0008) |

Out of scope: Horizon itself, and the Stellar protocol.

## Readiness checklist (before engaging)

- [ ] The release candidate is frozen: a tagged commit with green CI (including `reproducible` and `e2e-mainnet`).
- [ ] The threat model (SECURITY §2) and invariants (CLAUDE.md §6) are up to date. Reviewers get those and this file first.
- [ ] Known limitations are listed for reviewers (e.g. the extension can't protect a compromised browser or OS; SECURITY §2).
- [ ] Test vectors and the testnet suite pass (`pnpm test`, `pnpm test:testnet`, `pnpm test:e2e`, `pnpm test:e2e:mainnet`).
- [ ] The source is accessible to the reviewer (the repository is currently private).
- [ ] Budget and timeline agreed, and a re-review of fixes included in the quote.
- [ ] The report will be published, so users can read it. Agree on this up front.

## Candidate reviewers

Firms with **public** reports on browser-extension wallets and key handling (checked 2026-10-17). None is endorsed; get quotes.

| Firm | Relevant public work |
|---|---|
| **Least Authority** | [Avalanche browser extension + SDK](https://leastauthority.com/151223_ava-labs_avalanche-browserextension-and_sdk-3rd-review_final-audit-report) (2023: KDF strength, low-entropy passwords, encryption argument validation); [Tally extension key handling](https://leastauthority.com/static/publications/LeastAuthority-YLVIS_LLC_Tally_Browser_Extension_Wallet_Key_Handling_Final_Audit_Report.pdf) (2022); [Blank wallet extension](https://leastauthority.com/blog/blank-wallet-browser-extension/); MetaMask Snaps |
| **Cure53** | [Trust Wallet browser extension](https://trustwallet.com/assets/files/cure53_tw_browser_extension_04.2023.pdf) (2023, including the service-worker variant); [MetaMask](https://cure53.de/pentest-report_metamask.pdf); several wallet Snap reviews |
| **Trail of Bits** | [Uniswap browser extension](https://new.trailofbits.com/library/uniswap-browser-extension/) (2024) |

When comparing, ask for: MV3 service-worker experience, at least one public wallet-extension report, cryptography review (not just a web pentest), a fixed scope matching the table above, and a re-test of fixes.

## Funding

- **Soroban Security Audit Bank: not eligible.** It requires the project to "have been funded by SCF", and it covers Soroban **smart contracts** and related infrastructure. Stellix has no SCF funding and no contracts ([official rules](https://stellar.gitbook.io/scf-handbook/supporting-programs/audit-bank/official-rules)).
- **Stellar Community Fund Build Award:** up to $150K in XLM, paid in tranches, for building on Stellar; wallets appear among past awards ([SCF v7](https://stellar.org/blog/ecosystem/introducing-scf-v7)). **Unverified:** whether award funds may be spent on an external audit, and whether an SCF award would then open Audit Bank eligibility. Ask SCF before relying on either.
- Otherwise, self-funded. Expect a quote based on the scope above, which is a small codebase with a crypto-heavy core.
