# 0003 — Two-phase prepare/confirm signing inside the service worker

- Status: Accepted
- Date: 2026-10-11

## Context
The user must sign exactly what they reviewed. If the UI builds a transaction and sends XDR to be signed, a UI bug or compromised UI context could get a different transaction signed than the one displayed. MV3 service workers can also be terminated between "review" and "confirm".

## Decision
- `PREPARE_PAYMENT`: the SW validates inputs, loads accounts, builds the transaction, derives the human-readable summary **from the built transaction**, stores `{ xdr, networkId, summary, expiresAt }` in `chrome.storage.session` under a random ID, and returns the summary.
- `CONFIRM_PAYMENT{ preparedId }`: the SW loads that exact stored transaction, re-checks expiry, network, and summary assertions, signs, and submits.
- The UI never sends XDR to be signed in the MVP.

## Consequences
- What is displayed and what is signed come from the same object.
- Prepared transactions survive SW termination (session storage) and expire with their timebounds.
- When dapp signing arrives post-MVP, externally supplied XDR will go through the same summarize-from-transaction path before any approval.

## Alternatives considered
- **UI builds, SW signs raw XDR**: rejected; weakens the integrity guarantee.
- **Build and sign in one call after UI confirmation of inputs**: rejected; the user would approve their *inputs*, not the actual fee/op type/destination resolution.
