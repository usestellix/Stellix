import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // No logging in a static marketing site (and nothing that could leak into a build log).
      "no-console": "error",
      // The site stays moveable: nothing outside this folder, nothing from the extension.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { regex: "^\\.\\./", message: "Import through the @/ alias, not a parent path." },
            { regex: "^@stellix/", message: "The site never imports the extension's packages." },
          ],
        },
      ],
      // Raw HTML is reserved for the build-time privacy renderer, which allows it explicitly.
      "react/no-danger": "error",
    },
  },
  globalIgnores([".next/**", "out/**", "next-env.d.ts"]),
]);
