#!/usr/bin/env bash
# Local gate runner: stops at the first failing step. Exit codes decide, not output.
set -euo pipefail
pnpm format:check >/dev/null
pnpm typecheck >/dev/null
pnpm lint >/dev/null
scripts/check-no-console.sh >/dev/null
out=$(mktemp)
if ! pnpm test >"$out" 2>&1; then
  cat "$out"
  rm -f "$out"
  echo "gates: unit tests FAILED" >&2
  exit 1
fi
grep -E "Tests " "$out"
rm -f "$out"
echo "gates: format, typecheck, lint, console, unit tests all passed"
