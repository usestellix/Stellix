#!/usr/bin/env bash
# SECURITY §7: no `console.` outside packages/core/src/log.ts. Backstops ESLint's no-console.
set -euo pipefail
hits=$(grep -rnE '\bconsole\.' --include='*.ts' --include='*.tsx' --include='*.mjs' \
  apps packages scripts \
  --exclude-dir=node_modules --exclude-dir=.output --exclude-dir=.wxt \
  | grep -v -e '^packages/core/src/log.ts:' -e '^scripts/check-lint-restrictions.mjs:' || true)
if [[ -n "$hits" ]]; then
  echo "console usage outside packages/core/src/log.ts:" >&2
  echo "$hits" >&2
  exit 1
fi
echo "No console usage outside packages/core/src/log.ts"
