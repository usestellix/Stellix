# CONVENTIONS.md — Code style and project conventions

## 1. TypeScript

`tsconfig.base.json`:

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "useUnknownInCatchVariables": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  }
}
```

TypeScript is pinned to 6.0.x: typescript-eslint does not support TypeScript 7 (its peer range is `<6.1.0`). TS 6 defaults `types` to `[]`, so each package lists the ambient types it needs.

- No `any`. Use `unknown` and narrow (zod or type guards).
- No non-null assertions (`!`) except in tests.
- No enums; use string-literal unions + `as const` objects.
- Exhaustive `switch` on unions with a `never` check helper (`assertNever`).
- Named exports only (no default exports), except where WXT requires a default export for entrypoints.

## 2. Money and numbers

- Stroops are `bigint`. Function names make units explicit: `amountStroops`, `feeStroops`, `formatXlm(stroops)`.
- Across `chrome.runtime` messaging, bigints are serialized as decimal **strings** (structured clone of bigint isn't reliable across all paths; JSON can't carry them). Schema: `z.string().regex(/^\d+$/)` then `BigInt()`.
- Never `Number(x)` on an amount. Never `parseFloat`.

## 3. Files and naming

- `kebab-case.ts` file names; one primary export per file where reasonable.
- Types: `PascalCase`. Functions/vars: `camelCase`. Constants: `UPPER_SNAKE_CASE`.
- Tests next to code in `__tests__/`, named `<file>.test.ts`; testnet tests `<file>.testnet.test.ts`.
- Keep files under ~300 lines; split by responsibility.
- `packages/core/src/index.ts` re-exports the public API; shells import only from `@stellix/core`, never deep paths.

## 4. Errors

```ts
export type ErrorCode =
  // auth / session
  | "LOCKED" | "INVALID_PASSWORD" | "VAULT_NOT_FOUND" | "VAULT_CORRUPT" | "UNLOCK_THROTTLED"
  // onboarding
  | "INVALID_MNEMONIC_WORD" | "INVALID_MNEMONIC_CHECKSUM" | "VERIFICATION_FAILED" | "ONBOARDING_EXPIRED"
  // input
  | "INVALID_ADDRESS" | "SECRET_KEY_ENTERED" | "SELF_PAYMENT" | "INVALID_AMOUNT"
  | "MEMO_TOO_LONG" | "INVALID_MEMO_ID" | "MEMO_WITH_MUXED" | "MEMO_REQUIRED"
  // account state
  | "SOURCE_UNFUNDED" | "MULTISIG_UNSUPPORTED" | "MUXED_DESTINATION_UNFUNDED"
  | "INSUFFICIENT_BALANCE" | "BELOW_MIN_STARTING_BALANCE"
  // tx lifecycle
  | "PREPARED_TX_NOT_FOUND" | "PREPARED_TX_EXPIRED" | "NETWORK_MISMATCH" | "SIGNING_FAILED"
  | "FEE_TOO_LOW" | "CLOCK_SKEW" | "TX_EXPIRED_NOT_INCLUDED"
  | "DESTINATION_UNFUNDED_RACE" | "DESTINATION_CREATED_RACE" | "UNKNOWN_TX_ERROR"
  // network
  | "NETWORK_ERROR" | "RATE_LIMITED" | "HORIZON_BAD_RESPONSE" | "HORIZON_NOT_FOUND"
  | "NOT_AVAILABLE_ON_NETWORK" | "FRIENDBOT_FAILED" | "INVALID_HORIZON_URL"
  // messaging
  | "UNAUTHORIZED_SENDER" | "INVALID_REQUEST"
  // catch-all
  | "INTERNAL_ERROR";
```

- Throw `StellixError` from core. Catch at boundaries (message handler, React error boundary) and convert.
- Unknown thrown values become `INTERNAL_ERROR` with a sanitized message; the original is logged at `debug` (never containing secrets — see SECURITY §7).
- Add a code only when the UI or caller would behave differently for it. Update `ui/errorCopy.ts` in the same change; a test asserts every `ErrorCode` has copy.

## 5. Async and side effects

- No floating promises (`@typescript-eslint/no-floating-promises`).
- Pass dependencies (`Platform`, `HorizonClient`) as parameters; no module-level singletons in core.
- Pure functions for anything that doesn't need I/O; they're trivial to test.

## 6. React (extension UI)

- Function components and hooks only.
- One screen per file under `ui/screens/`; shared pieces under `ui/components/`.
- No secrets in React state, props, or context — ever.
- Tailwind (v4) for styling; design tokens (colors, spacing) in the `@theme` block of `apps/extension/src/ui/theme.css`. Tailwind v4 is configured in CSS; there is no `tailwind.config.ts`.
- Extension APIs come from `import { browser } from "wxt/browser"`, which is the raw `chrome` object on Chromium (no polyfill) and keeps the Firefox build working. Docs still say `chrome.*`; they mean the same API.
- All user-visible strings in one place per screen (preparing for i18n later; no i18n library in MVP).

### 6.1 Visual and motion rules

Applied from Emil Kowalski's published design-engineering guidance (`emilkowalski/skills`, Oct 2026), adapted to "no component library in MVP". Every new screen follows these:

- **Palette:** neutral ink. Color appears only where it carries meaning (network, danger, warning, success, focus). Primary buttons are ink, not brand blue.
- **Edges:** semi-transparent shadow rings (`shadow-ring`, `shadow-ring-strong`, `shadow-raised`), not solid borders. Divider lines are `0 1px 0 var(--color-line)` shadows.
- **Icons:** the inline SVG set in `ui/components/icons.tsx` (20px grid, 1.5px stroke, `currentColor`). **No emoji as UI.**
- **Type:** system font stack only (no remote fonts). Headings are tightened (`-0.02em`); small uppercase labels are loosened (`0.06–0.08em`). Addresses and numbers use `font-mono` / `tabular`. Body text is capped around 52–65ch.
- **Press feedback:** every pressable element uses `.pressable` (`scale(0.97)` on `:active`, 160ms, `--ease-out`).
- **Hover:** use the `hover-fine:` variant, never bare `hover:` (touch devices fire false hovers).
- **Motion budget, by how often a surface is seen:**
  - The popup (opened many times a day) has **no** entrance or screen-change animation.
  - Onboarding steps (rare, first-time) may use `.enter`: opacity plus 6px rise, 220ms.
  - UI motion stays under 300ms, animates only `transform`/`opacity` (`filter` for the phrase reveal), never `transition: all`, never `ease-in`, never `scale(0)`.
  - Under `prefers-reduced-motion`, only opacity changes remain.
- **Feedback:** never insert content (error text, banners) on blur near a button; the layout shift makes the click miss. Show outlines on blur and messages on submit.
- **Libraries:** the curated picks (base-ui, Sonner, motion, NumberFlow, clsx/cva) still need an ADR before they're added (CLAUDE.md §4). `ui/cx.ts` stands in for clsx.

## 7. Linting & formatting

- ESLint with `@typescript-eslint` strict-type-checked config, plus:
  - `no-console` (except in `core/log.ts`)
  - `no-restricted-imports`: in `packages/core`, forbid `react`, `react-native`, `webextension-polyfill`, `wxt*`, and Node built-ins (`fs`, `path`, `crypto` as a module, `buffer`).
  - `no-restricted-globals`: in `packages/core`, forbid `chrome`, `browser`, `window`, `document`, `localStorage`, plus `sessionStorage`, `indexedDB`, `EventSource`, `self`, `navigator`.
  - `no-restricted-properties`: in `packages/core`, forbid the same names via `globalThis.*`, and `Math.random`.
  - `scripts/check-lint-restrictions.mjs` runs as part of `pnpm lint` and fails if any of these restrictions stops firing.
- Prettier, default settings, 100 col. Markdown is excluded, so docs stay hand-formatted.

## 8. Git

- Conventional commits: `feat(core): …`, `fix(extension): …`, `docs: …`, `test: …`, `chore(deps): …`.
- One logical change per commit. Docs updates go in the same commit as the behaviour change.
- `chore(deps)` commits must state why each new/updated dependency is needed.

## 9. ADRs

`docs/decisions/NNNN-short-title.md`, numbered sequentially, never edited after acceptance except to mark *Superseded by NNNN*. Template:

```markdown
# NNNN — Title

- Status: Proposed | Accepted | Superseded by NNNN
- Date: YYYY-MM-DD

## Context
## Decision
## Consequences
## Alternatives considered
```
