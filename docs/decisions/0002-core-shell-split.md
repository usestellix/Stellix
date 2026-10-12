# 0002 — Platform-agnostic core package with thin platform shells

- Status: Accepted
- Date: 2026-10-11

## Context
Stellix ships as an extension first and a mobile app later. Keys, vault, transaction building, fee policy, Horizon access, and history normalization are identical on both platforms. Storage, lifecycle, and UI differ.

## Decision
All platform-independent logic lives in `packages/core` (pure TypeScript). It reaches the platform only through interfaces in `platform.ts` (`KeyValueStore`, `now`, `fetch`). Shells (`apps/extension`, later `apps/mobile`) provide adapters, lifecycle handling, messaging, and UI. ESLint forbids platform imports and globals in core.

## Consequences
- The mobile app reuses core unchanged; only adapters and UI are new.
- Core is testable with in-memory fakes and a fake clock.
- Slight indirection cost: core functions take dependencies as parameters.

## Alternatives considered
- **Single extension codebase, extract later**: rejected; extraction after the fact is where platform assumptions leak in and security-critical code gets duplicated.
