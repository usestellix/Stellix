# UI_FLOWS.md — Screens, states, copy

Every screen below lists the states it must render. A screen isn't done until every listed state has been seen in a running build. Popup size: **360 × 600 px**. Onboarding page: full tab, centered column max 480 px.

Copy guidance: short, plain sentences. Say what happened and what to do next. Never show raw Horizon or SDK errors (use `ui/errorCopy.ts`).

---

## 0. Global chrome (popup)

Header on every unlocked screen:
- Left: account selector (label + `GABC…WXYZ`).
- Right: network badge. `TESTNET` neutral/amber; `MAINNET` red-tinted. Clicking it opens Settings → Network.
- Lock icon button.

## 1. Popup routing on open

```
GET_STATUS
 ├─ hasVault = false            → "Welcome" (button: Get started → opens onboarding tab, then window.close())
 ├─ hasVault, unlocked = false  → Unlock
 ├─ in-flight tx present        → Home with a "Confirming transaction…" banner
 └─ unlocked                    → Home
```

## 2. Onboarding (full tab)

### 2.1 Welcome
Two options: **Create a new wallet** / **I already have a recovery phrase**.

### 2.2 Create → Show phrase
- Warning card first: "Your recovery phrase is the only way to restore your wallet. Anyone who has it can take your funds. Write it on paper. Don't screenshot it."
- 12 words in a 3×4 numbered grid, **blurred** until "Reveal" is clicked.
- No copy button.
- Button "I've written it down" (enabled after reveal).
- States: loading (generating), revealed, error (generation failed — retry).

### 2.3 Create → Verify
- "Select word #3, #7, #11" — for each, a choice of 4 candidate words (1 correct + 3 random from the wordlist) or a text input with autocomplete. Use text input; it better proves the user wrote the phrase down.
- Wrong → inline error on that position, allow retry, offer "Show my phrase again".
- States: idle, partial, error per field, verified.

### 2.4 Password
- Password + confirm, strength meter, the "can't recover your password" notice.
- Submit triggers vault creation: show a progress state ("Securing your wallet…") because scrypt takes ~1 s.
- States: idle, mismatch, too short, working, error.

### 2.5 Import
- 12/24 toggle; one input per word; pasting a full phrase into the first box fills all boxes.
- Per-word wordlist validation (red outline on unknown words); checksum error message if all words valid but invalid phrase.
- Then Password screen (2.4), then "Finding your accounts…" (discovery), then done.
- States: idle, invalid word(s), invalid checksum, working, discovery partial-failure notice, done.

### 2.6 Done
"Stellix is ready. Click the Stellix icon in your browser toolbar to open it." Include a small illustration hint to pin the extension.

## 3. Unlock (popup)
- Password field (autofocus), Unlock button, "Forgot password?" link → explains: reset the wallet and restore with your recovery phrase (link to Settings → Reset, behind confirmation).
- States: idle, working (~1 s), wrong password (shake + message), too many attempts (after 5 consecutive failures, enforce a 30 s delay — UI-level throttle only).

## 4. Home (popup)

- **Balance card**: total XLM (large; steps down from 28 to 22 to 18 px for long values so even the int64 maximum fits, never truncated), below it "Available: X XLM   Reserved: Y XLM ⓘ" (two groups that never break internally; on a long balance the Reserved group, icon included, wraps to the next line). Tooltip: "Stellar keeps a small amount of XLM locked in every account. You can't send it, but you get it back if you close the account."
- Buttons: **Send**, **Receive** (Send only for funded single-signer accounts; Receive always).
- **Recent activity**: last 10 normalized history items; "View all" opens History (§7). The full address lives on Receive (§6); the header shows it truncated.
- States:
  - loading (skeletons)
  - funded
  - **unfunded**: "This account isn't active on Stellar yet. Send it at least 1 XLM to activate it." + Receive button. On testnet, also **Fund with Friendbot** button.
  - network error (retry button, last known balance shown greyed with "as of HH:MM" if available)
  - testnet reset detected (was funded earlier in session, now 404): same as unfunded plus "Testnet was reset."
  - confirming-transaction banner

## 5. Send (popup)

### 5.1 Input
- Destination field: a two-line wrapping field, so the whole address is visible (lookalike addresses differ in the middle and end); validates on blur. *No paste button in the MVP:* reading the clipboard needs the `clipboardRead` permission (CLAUDE.md §6.11). ⌘V / Ctrl+V works. Shows inline errors from TRANSACTIONS §2. If `M...`, show a hint "This address includes a recipient ID — no memo needed."
- Amount field: XLM, "Max" button, shows "Available: X XLM" beneath.
- Memo section (collapsed "Add memo"): type selector (Text / ID) + value with byte counter for text. If the destination is known to require a memo (SEP-29, discovered on blur via a lightweight account fetch in the popup), expand automatically with "This recipient requires a memo. Exchanges use it to credit your deposit."
- Continue → PREPARE_PAYMENT.
- States: idle, field errors, preparing (spinner), prepare error (mapped).

### 5.2 Review
- Title: "Review" plus network badge repeated large.
- Rows: Type ("Send XLM" / "Activate new account"), To (full address in 4-char groups, monospace), Amount, Memo (or "None"), Network fee, **Total**.
- Warnings (if applicable): first-time destination; activating a new account ("This address isn't active yet. Sending will activate it — minimum 1 XLM."); fee estimated.
- **What Shield found** (#36): the report from PREPARE_PAYMENT, with the findings components (SHIELD §3.1): findings by severity, or "The checks that ran flagged nothing.", then "Checks that couldn't run" when any didn't. Never "safe". The decision shown only gates the button; the SW re-checks its own stored report at confirm (invariant 15).
  - Review, click: Confirm as usual; pressing it is the click.
  - Review, typed: "To continue, type {phrase} below." with the decision's `typedPhrase` (never a constant in the UI) and an input; Confirm stays disabled until the input matches exactly.
  - Blocked: "Stellix won't sign this. The findings above say why." and Confirm disabled, with no override. PREPARE refuses blocked payments today, so this is defense in depth.
  - A payment Stellix builds produces no findings today (the destination is the one entered, the fee is capped below `HIGH_FEE`, timebounds are 180 s, `MEMO_REQUIRED` blocks at prepare). The findings states exist for future flows (swaps, trustlines) and are tested in a harness (TESTING §3).
- Expiry countdown (from `expiresAt`); when it hits zero, the Confirm button becomes "Review again" (re-prepare).
- Buttons: Cancel (CANCEL_PAYMENT) / **Confirm and send** (CONFIRM_PAYMENT with `{ kind: "click" }`, or `{ kind: "typed", phrase }` for a typed review).
- States: ready, review-click, review-typed (input empty / not matching / matching), blocked, expired, confirming.

### 5.3 Result
- Submitting: "Sending…".
- Resolving: "Confirming on the network…" (may last up to ~3 min worst case; tell the user it's safe to close the popup).
- Success: checkmark, amount, short hash, "View on explorer", Done.
- Failed: mapped error, primary action depends on code (Try again / Edit / Send max).
- Rebuild needed: auto re-prepare and return to Review with a note "Network conditions changed. Please review again."

## 6. Receive (popup)
- Opened from Home's Receive button, always offered (funded or not). One primary per screen: Receive is secondary next to Send or Friendbot.
- QR of the plain `G...` address. Dark on white in both themes, ECC level M, 4-module quiet zone, drawn as one SVG path (`ui/lib/qr.ts`).
- Full address (monospace, 4-char groups). The pinned footer action copies it; its label changes to "Copied" for 1.5 s. No toast. A clipboard failure shows `CLIPBOARD_UNAVAILABLE` copy.
- "Request a specific amount" (right under the QR, so the code stays in view) → amount + optional memo (text or ID) → QR switches to the SEP-7 URI and the footer action becomes "Copy payment link".
  - Testnet: `web+stellar:pay?destination=G…&amount=…&memo=…&memo_type=MEMO_TEXT&network_passphrase=Test%20SDF%20Network%20%3B%20September%202015`. SEP-7 requires `network_passphrase` off the public network; mainnet links omit it.
  - Until the request is valid, no QR is shown (a placeholder says to enter or fix the amount) and the copy action is disabled, so nobody scans a code that doesn't match the screen.
- Note: "Only send XLM on Stellar to this address." On testnet add "This is a testnet address — test XLM has no value."
- States: default, request-amount (empty / invalid / valid), unfunded hint ("Send at least 1 XLM to activate this account").

## 7. History (popup)
- Infinite scroll, 20 per page (older pages load when the end of the list comes into view; a page holding only hidden non-XLM records loads the next one).
- Row: direction icon, "Received from GABC…WXYZ" / "Sent to …" / "Account activated by …" / "Activated …" / "Merged in from …" / "Merged into …", amount (+/−), relative time; memo as a secondary line if present. Rows never show a fee.
- Tap → detail screen: amount, From / To (full addresses; "You" for this account, plus the recipient ID when paid to our `M` address), memo, fee, date, hash, "View on explorer" (opens a tab; NETWORK §8).
  - Fee only when this account paid it (`fee_account`), not merely because the item is outgoing. "Network fee" for a single-operation transaction; **"Transaction fee"** for a multi-op one, with "Paid once for all N operations in this transaction."
  - A merge's amount is loaded from its effects when the detail opens.
- Live while the popup is open (NETWORK §6): new payments appear at the top and the balance refetches.
- States: loading, empty ("No activity yet"), error with retry (also for a failed older page), end of list. The end is worded by what we know, since Horizon keeps about a year:
  - the oldest item is the `create_account` that funded this account → "This is where your account started.";
  - otherwise → "No older activity available from this server."

## 8. Accounts (popup)
- List: label, truncated address, XLM balance (lazy).
- Active marker; tap to switch.
- Rename inline.
- "Add account" (requires unlocked).
- Network switch prompt: "Scan for accounts on this network" when the list was built on another network.

## 9. Settings (popup, some actions open full tab)
- Network: Testnet / Mainnet. Switching to Mainnet shows a confirmation dialog with checkbox "I understand this uses real XLM". Only in mainnet-enabled builds (ADR 0008); a testnet-only build has no Network row, and About shows "Networks: Testnet only".
- Advanced → Custom Horizon URL per network (validated per NETWORK §1).
- Auto-lock: 5 / 15 / 30 / 60 minutes.
- Security: Reveal recovery phrase (opens tab, password), Change password.
- Danger zone: Reset wallet (typed "RESET").
- About: version, commit hash, source link, privacy note.

## 10. Accessibility & polish
- All interactive elements keyboard-reachable; visible focus rings.
- Color is never the only signal (network badge has text; errors have icons + text).
- Respect `prefers-color-scheme` (light/dark).
- Monospace for addresses and hashes; numbers right-aligned in lists.
