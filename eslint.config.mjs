// @ts-check
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const PLATFORM_MESSAGE = "packages/core must stay platform-agnostic (ADR 0002, CONVENTIONS §7).";

const NODE_BUILTINS = [
  "assert",
  "buffer",
  "child_process",
  "crypto",
  "events",
  "fs",
  "fs/promises",
  "http",
  "https",
  "net",
  "os",
  "path",
  "process",
  "stream",
  "url",
  "util",
  "worker_threads",
  "zlib",
];

const CORE_FORBIDDEN_GLOBALS = [
  "chrome",
  "browser",
  "window",
  "document",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "EventSource",
  "self",
  "navigator",
];

const CORE_RESTRICTED_GLOBALS = CORE_FORBIDDEN_GLOBALS.map((name) => ({
  name,
  message: PLATFORM_MESSAGE,
}));

const CORE_RESTRICTED_PROPERTIES = [
  ...CORE_FORBIDDEN_GLOBALS.map((property) => ({
    object: "globalThis",
    property,
    message: PLATFORM_MESSAGE,
  })),
  {
    object: "Math",
    property: "random",
    message: "Use crypto.getRandomValues (SECURITY §3.4).",
  },
];

const SHIELD_DEPS_MESSAGE =
  "Shield reads the clock and network only through ShieldDeps / RuleContext (SHIELD §6.4).";

export default defineConfig(
  {
    ignores: [
      "**/node_modules/**",
      "**/.output/**",
      "**/.wxt/**",
      "**/test-results/**",
      "**/playwright-report/**",
      "**/.e2e-profile/**",
    ],
  },

  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-console": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSEnumDeclaration",
          message: "No enums; use string-literal unions (CONVENTIONS §1).",
        },
        { selector: "ExportDefaultDeclaration", message: "Named exports only (CONVENTIONS §1)." },
      ],
      "no-eval": "error",
      "no-implied-eval": "off",
      "@typescript-eslint/no-implied-eval": "error",
      "no-new-func": "error",
    },
  },

  // packages/core: no platform imports or globals.
  {
    files: ["packages/core/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [...NODE_BUILTINS, "webextension-polyfill"].map((name) => ({
            name,
            message: PLATFORM_MESSAGE,
          })),
          patterns: [
            { group: ["node:*"], message: PLATFORM_MESSAGE },
            {
              group: [
                "react",
                "react/*",
                "react-dom",
                "react-dom/*",
                "react-native",
                "react-native/*",
              ],
              message: PLATFORM_MESSAGE,
            },
            { group: ["wxt", "wxt/*", "@wxt-dev/*"], message: PLATFORM_MESSAGE },
          ],
        },
      ],
      "no-restricted-globals": ["error", ...CORE_RESTRICTED_GLOBALS],
      "no-restricted-properties": ["error", ...CORE_RESTRICTED_PROPERTIES],
    },
  },
  // Shield: on top of the core rules, no direct clock or network access (rules are pure).
  {
    files: ["packages/core/src/security/**/*.ts"],
    ignores: ["**/__tests__/**"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...CORE_RESTRICTED_GLOBALS,
        { name: "fetch", message: SHIELD_DEPS_MESSAGE },
        { name: "performance", message: SHIELD_DEPS_MESSAGE },
      ],
      "no-restricted-properties": [
        "error",
        ...CORE_RESTRICTED_PROPERTIES,
        { object: "Date", property: "now", message: SHIELD_DEPS_MESSAGE },
        { object: "globalThis", property: "fetch", message: SHIELD_DEPS_MESSAGE },
      ],
    },
  },
  {
    files: ["packages/core/src/log.ts"],
    rules: { "no-console": "off" },
  },

  // Extension UI: React hooks rules.
  {
    files: ["apps/extension/src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },

  // WXT entrypoints and tool configs require default exports.
  {
    files: ["apps/extension/src/entrypoints/**/*.ts", "**/*.config.ts", "**/*.config.mjs"],
    rules: { "no-restricted-syntax": "off" },
  },

  // Node-side tooling and E2E tests.
  {
    files: ["**/*.config.{ts,mjs}", "scripts/**/*.mjs", "apps/extension/e2e/**/*.ts"],
    languageOptions: { globals: globals.node },
  },

  // Tests may use non-null assertions (CONVENTIONS §1).
  {
    files: ["**/__tests__/**/*.ts", "**/__tests__/**/*.tsx", "apps/extension/e2e/**/*.ts"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },

  prettier,
);
