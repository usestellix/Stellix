// Proves the packages/core platform restrictions in eslint.config.mjs still fire.
// Lints forbidden snippets as if they lived in core; fails if any is NOT reported.
// Run as part of `pnpm lint`.
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";

const CORE_FILE = "packages/core/src/__lint_self_test__.ts";
const EXT_FILE = "apps/extension/src/__lint_self_test__.ts";
// Shield's analysis code must stay platform-free too (SHIELD §3.1).
const SHIELD_FILE = "packages/core/src/security/__lint_self_test__.ts";

/** @type {[file: string, code: string, ruleId: string][]} */
const CASES = [
  [CORE_FILE, `import "fs";`, "no-restricted-imports"],
  [CORE_FILE, `import "node:crypto";`, "no-restricted-imports"],
  [CORE_FILE, `import "buffer";`, "no-restricted-imports"],
  [CORE_FILE, `import "path";`, "no-restricted-imports"],
  [CORE_FILE, `import "react";`, "no-restricted-imports"],
  [CORE_FILE, `import "react-native";`, "no-restricted-imports"],
  [CORE_FILE, `import "wxt/browser";`, "no-restricted-imports"],
  [CORE_FILE, `import "@wxt-dev/storage";`, "no-restricted-imports"],
  [CORE_FILE, `import "webextension-polyfill";`, "no-restricted-imports"],
  [CORE_FILE, `export const a = chrome;`, "no-restricted-globals"],
  [CORE_FILE, `export const a = browser;`, "no-restricted-globals"],
  [CORE_FILE, `export const a = window;`, "no-restricted-globals"],
  [CORE_FILE, `export const a = document;`, "no-restricted-globals"],
  [CORE_FILE, `export const a = localStorage;`, "no-restricted-globals"],
  [CORE_FILE, `export const a = EventSource;`, "no-restricted-globals"],
  [CORE_FILE, `export const a = globalThis.chrome;`, "no-restricted-properties"],
  [CORE_FILE, `export const a = Math.random();`, "no-restricted-properties"],
  [CORE_FILE, `console.log("x");`, "no-console"],
  [SHIELD_FILE, `import "fs";`, "no-restricted-imports"],
  [SHIELD_FILE, `export const a = chrome;`, "no-restricted-globals"],
  [SHIELD_FILE, `export const a = Date.now();`, "no-restricted-properties"],
  [SHIELD_FILE, `export const a = fetch;`, "no-restricted-globals"],
  [SHIELD_FILE, `export const a = Math.random();`, "no-restricted-properties"],
  [EXT_FILE, `console.log("x");`, "no-console"],
  [EXT_FILE, `eval("1");`, "no-eval"],
  [EXT_FILE, `export const f = new Function("return 1");`, "no-new-func"],
  // The marketing site (stellix-demo/) is isolated: no imports from it, core included.
  [EXT_FILE, `import "../../../stellix-demo/src/app/fonts";`, "no-restricted-imports"],
  [CORE_FILE, `import "../../../stellix-demo/src/app/fonts";`, "no-restricted-imports"],
];

// Shells may import platform modules; make sure the restriction is scoped to core.
/** @type {[file: string, code: string, ruleId: string][]} */
const MUST_PASS = [
  [EXT_FILE, `import "react";`, "no-restricted-imports"],
  // The clock ban is Shield-only; the rest of core reads time through Platform.now as before.
  [CORE_FILE, `export const a = Date.now();`, "no-restricted-properties"],
  // Shield tests may use real clocks and fixtures.
  [
    "packages/core/src/security/__tests__/__lint_self_test__.ts",
    `export const a = Date.now();`,
    "no-restricted-properties",
  ],
];

const eslint = new ESLint({
  overrideConfig: [{ files: ["**/__lint_self_test__.ts"], ...tseslint.configs.disableTypeChecked }],
});

let failures = 0;
for (const [file, code, ruleId] of CASES) {
  const [result] = await eslint.lintText(code, { filePath: file });
  if (!result?.messages.some((m) => m.ruleId === ruleId)) {
    failures++;
    process.stderr.write(`NOT REPORTED: ${ruleId} for \`${code}\` in ${file}\n`);
  }
}
for (const [file, code, ruleId] of MUST_PASS) {
  const [result] = await eslint.lintText(code, { filePath: file });
  if (result?.messages.some((m) => m.ruleId === ruleId)) {
    failures++;
    process.stderr.write(`WRONGLY REPORTED: ${ruleId} for \`${code}\` in ${file}\n`);
  }
}

if (failures > 0) {
  process.stderr.write(`Lint restriction self-test failed (${String(failures)} case(s)).\n`);
  process.exit(1);
}
process.stdout.write(
  `Lint restriction self-test: ${String(CASES.length + MUST_PASS.length)} cases OK\n`,
);
