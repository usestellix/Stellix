# Chrome Web Store "Privacy practices" tab (0.1.0)

Answers for each field of the dashboard's Privacy practices tab ([docs](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)). The store removes listings whose disclosures contradict the privacy policy or the extension's behaviour, so these must match `PRIVACY.md` and the code.

## Single purpose

```
Stellix is a non-custodial wallet for the Stellar network: it creates or imports a recovery phrase, keeps it encrypted on the device, shows the account's XLM balance and history, and sends and receives XLM payments.
```

## Permission justifications

The manifest requests exactly these two permissions (CLAUDE.md §6.11). There are no host permissions, no content scripts, and no `tabs` permission.

**storage**

```
Stores the wallet on the user's device: the recovery phrase encrypted with the user's password, account names and settings (local storage), and, while the wallet is unlocked, the session key and payment state in in-memory session storage, which the browser clears when it closes. Nothing is sent to any server operated by us; we operate none.
```

**alarms**

```
Auto-lock: a periodic alarm locks the wallet after the user's chosen idle time, even after the background service worker was stopped. A second alarm keeps checking a submitted payment until the network confirms or rejects it. If the background worker restarted, it only re-sends that same signed transaction, never a new one, so a payment is never made twice.
```

## Remote code

**No, I am not using remote code.** All JavaScript ships inside the package. Network requests fetch only data (JSON from the Stellar Horizon API and Friendbot). There's no `eval` or `new Function`, and the CSP is unchanged (CLAUDE.md §6.12).

## Data usage

**What user data do you plan to collect from users now or in the future?** The store requires disclosing data handled locally too. Tick:

- [x] **Authentication information:** the wallet password. It's processed only on the device to unlock the vault and is never stored or transmitted.
- [x] **Financial and payment information:** XLM balances and transaction history, read from the Horizon server and shown to the user. The account addresses are sent to that server to fetch them.

Leave the rest unticked: personally identifiable information, health, personal communications, location, web history, user activity, website content.

**Certifications** (tick all three):

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases.
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes.

The only transfer is to the Horizon server the wallet needs in order to work. The store's Limited Use rules also exempt a "client for an internet protocol with user-specified servers" for data exchanged with that server ([user data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq)). Stellix's Horizon is user-configurable, but we disclose it regardless.

## Privacy policy URL

TODO: the GitHub Pages URL serving `PRIVACY.md`. Submission is blocked until it's live.
