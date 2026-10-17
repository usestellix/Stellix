# Incident response

How we respond when something goes wrong with a released Stellix build. Read this together with SECURITY §9 (build and release) and `.github/RELEASE.md`.

## What we can and can't do

Stellix has **no server and no kill switch** (CLAUDE.md §1). We can't disable copies already installed, read anyone's wallet, or move or freeze funds. Our only levers are the Chrome Web Store and our own communication.

| Lever | What it does | Speed | Limits |
|---|---|---|---|
| **Rollback** (dashboard) | Republishes the **previous** version under a new version number | Live "within a minute", **no review** | Only the immediately previous version. Useless if that version is also affected. |
| **Emergency update** | A normal upload of a fixed build (`.github/RELEASE.md`) | Normal review: "a few days, up to a few weeks"; no documented expedite | Needs the upload-signing key. Code changes can lengthen review. |
| **Unpublish** | "Remove the published version of this item from the Chrome Web Store" | Immediate | Stops new installs. The docs don't say it removes installed copies, so assume they keep running. |
| **Report to Google** | Google can remove an extension for malware and, in that case, disable it in users' browsers | Google's timeline | We can't trigger it ourselves. Use it for a malicious build we can no longer control. |
| **Percentage rollout** | Ship an update to a fraction of users first | — | Only offered above 10,000 users. Not available for 0.x. |

Sources: [rollback](https://developer.chrome.com/docs/webstore/rollback), [update / unpublish / verified uploads](https://developer.chrome.com/docs/webstore/update), [review process](https://developer.chrome.com/docs/webstore/review-process).

**Testnet-only doesn't mean no real money.** 0.x builds can't use mainnet (ADR 0008), but users can import a recovery phrase that holds real funds in another wallet. A build that leaks phrases or passwords puts those funds at risk. Treat any secret-handling bug as severe, whatever network the build supports.

## Severity

| Level | Examples | Response |
|---|---|---|
| **Critical** | A shipped build leaks or can leak a recovery phrase, key or password; signs something other than what was approved (CLAUDE.md §6.6); or is malicious (compromised account or key) | Act within the hour: rollback, revoke, advisory to move funds. Playbooks A and B. |
| **High** | Funds could be lost without key exposure, e.g. a wrong destination or amount, or a double send | Same day: rollback if the previous version is safe, then a fix. Playbook C. |
| **Medium / low** | Wrong display, broken flow, failed requests; no fund risk | A normal fixed release |

## Playbook A: a malicious build shipped (credential compromise)

Shipping a build requires **both** the publisher's Google account (hardware-key 2-Step Verification) **and** the offline upload-signing key, because Verified CRX uploads are on. If a build we didn't make goes live, assume both are compromised.

1. **Roll back** at once, if the previous version is ours and clean. If the attacker controls the dashboard, go to step 3.
2. **Revoke:**
   - remove any unknown member from the publisher;
   - reset the Google account and replace both hardware keys;
   - generate a new upload-signing key and contact store support to replace the registered one (up to a week; uploads are blocked meanwhile, but rollback still works).
3. **Contact Chrome Web Store support**, and report the malicious version to Google for takedown.
4. **Advise users** through every channel below: anyone who opened the affected version should **treat their recovery phrase as compromised**. Install a known-good version, create a **new** recovery phrase, and move funds to it. Funds in other wallets using the same phrase are also at risk.
5. **Publish a GitHub Security Advisory** with the affected versions, hashes and timeline.
6. **Afterwards:** a post-mortem, credential review, and an update to this document.

## Playbook B: a secret-exposing bug in our own build

1. Roll back if the previous version is safe; otherwise unpublish and ship a fix.
2. Advise users, scoped to who is actually affected. If secrets may have left the device, give the same "new phrase, move funds" advice as Playbook A.
3. Fix with a regression test; release through `.github/RELEASE.md`; publish an advisory.

## Playbook C: other fund-affecting bugs

Roll back if the previous version doesn't have the bug, otherwise ship a fix. Publish release notes saying what was affected and what users should check (e.g. history entries). Advisory if funds were lost.

## Other cases

- **Vulnerable dependency:** check whether the vulnerable code is in the shipped bundle (`.output/bundle-modules.json`) and reachable. If it is, handle it by severity. Update following the dependency policy (SECURITY §8); an advisory may need an exception to the 14-day minimum age, recorded in the PR.
- **Horizon outage or misbehaviour:** the wallet keeps showing the last known balance (UI_FLOWS §4). Users can set a custom Horizon URL (NETWORK §1). Not a release incident unless our handling is wrong.
- **Phishing clones (T9):** report the clone to Google. Warn users in the README and the store description, giving the one official listing link.

## Communication channels

In order. Use all of them for Critical and High.
1. **GitHub Security Advisory** on the repo: the authoritative record.
2. **README banner** at the top of `README.md` on `main`.
3. **GitHub release notes** of the fixing release, or an edit to the affected release.
4. **Store listing description:** a short notice at the top. Listing edits are submitted like any change and may wait for review.
5. **Social account:** TODO (owner) — which account, and who can post.

**Reports come in through:** GitHub private vulnerability reporting ("Report a vulnerability" on the Security tab; TODO: enable it in the repo settings), and by email to TODO (security email; it must also be the verified contact email in the store dashboard).

## Credentials and custody

As SECURITY §9.4 describes. Fill in the TODOs before the first upload.

| Credential | Held by | Protection | Recovery |
|---|---|---|---|
| Chrome Web Store publisher "Stellix Labs" (Admin) | TODO (owner account) | Two hardware security keys for 2-Step Verification: one in daily use, one spare stored separately | Use the spare key; then replace the lost one |
| **Upload-signing key** (RSA 2048, Verified CRX uploads) | The Admin, offline | **Primary:** on an offline, encrypted medium, never in a Google account, cloud drive or CI. **Backup:** a separate encrypted copy (e.g. a passphrase-protected PKCS#12 file) in a different physical location, with the passphrase stored apart from it. TODO (owner): record where the primary and the backup are kept (not in this repo). | Lost primary: restore from the backup. Both lost or exposed: generate a new key and ask store support to replace the registered public key. Replacement "can take up to one week", during which no update can be uploaded; rollback still works. |
| GitHub org / repo admin | TODO (owner account) | Hardware-key 2FA | GitHub account recovery |
| CI (GitHub Actions) | — | **Holds no publishing credentials and no signing key** | — |

## Drill

Before the first public release, and yearly:
- restore the signing key from the backup and sign a test CRX with it;
- confirm the spare hardware key signs in;
- walk Playbook A on paper.
