# Stellix privacy policy

Stellix is a non-custodial Stellar wallet browser extension published by **Stellix Labs**. This policy covers the Stellix extension. It's the source of the privacy-policy page linked from the Chrome Web Store listing.

Last updated: TODO (release date of 0.1.0)

## The short version

- Stellix Labs runs **no servers**, and **collects nothing**: no accounts, no analytics, no telemetry, no crash reports, no advertising.
- Your recovery phrase and keys are created on your device, stored there **encrypted with your password**, and never sent anywhere.
- To show balances and history and to send payments, the extension talks directly to a public Stellar **Horizon** server. **That server's operator can see your IP address and the Stellar account addresses you use.**

## What stays on your device

| Data | Where | Protection |
|---|---|---|
| Recovery phrase | The extension's local storage, inside an encrypted vault | AES-256-GCM with a key derived from your password (scrypt). Without the password it can't be read. |
| Your password | Not stored | Used only to unlock. While unlocked, a derived key sits in the browser's in-memory session storage, cleared when you lock or close the browser. |
| Account names, settings (network, auto-lock time, custom Horizon URL) | Local storage | Not encrypted. Contains no secrets. |
| Recently viewed balances and activity | In-memory session storage | Public blockchain data, cleared when the browser closes. |
| Transactions you paste into Analyze | Not stored | Analyzed and shown, then discarded. Issuers' `stellar.toml` lists are cached in session storage for an hour. |

None of this is sent to Stellix Labs: there is nowhere to send it. Uninstalling the extension deletes it. Keep your recovery phrase: it's the only way back into your wallet.

## Who else receives data, and what

| Recipient | When | What they receive |
|---|---|---|
| **The Horizon server operator.** By default the **Stellar Development Foundation** (`horizon-testnet.stellar.org`). If you set a custom Horizon URL, its operator instead. | While you use the wallet (balances, history, live updates, fees, sending, and the accounts, order books and payment paths **Analyze** looks up), and in the background while a payment you sent is still confirming, even if the wallet is locked or closed | Your **IP address**, the **Stellar account addresses** you look up, and the transactions you submit. Their own privacy terms apply. |
| **An asset issuer's website** (the issuer's own home domain, as its Stellar account declares it) | Only when you use **Analyze** on a transaction that adds or changes a trustline: Stellix fetches `https://<that domain>/.well-known/stellar.toml` to see whether the issuer lists the asset. Cached for an hour, in memory only | Your **IP address**, and that someone requested that file. No account address, no cookies, no other data. |
| **Friendbot** (testnet faucet, operated by the Stellar Development Foundation) | Only when you tap "Fund with Friendbot" | Your IP address and the account address to fund |
| **StellarExpert** (block explorer) | Only when you tap "View on explorer" | It opens in a new tab like any website you visit |

Stellar is a **public blockchain**. Every transaction you send or receive, including its amount, addresses and memo, is permanently public, whichever wallet you use.

## Clipboard

Stellix writes to your clipboard only when you tap a Copy button (your address or a payment link). It never reads your clipboard, and it never copies your recovery phrase.

## Chrome Web Store user data disclosure

The Chrome Web Store asks extensions to disclose data they handle, even locally. Stellix handles **authentication information** (your password, processed only on your device) and **financial and payment information** (balances and transaction history, read from Horizon and shown to you). Stellix Labs doesn't sell this data, doesn't use or transfer it for purposes unrelated to the wallet, and doesn't use it to determine creditworthiness or for lending. Its use adheres to the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/policies), including the Limited Use requirements.

## Children

Stellix isn't directed at children under 13, and collects no personal information from anyone.

## Changes

Changes to this policy are published in this file in the Stellix source repository, with its history, before they take effect.

## Contact

Report security issues privately through GitHub's **Report a vulnerability** form on the Stellix repository, or by email to TODO (security email). For other questions, TODO (contact).
