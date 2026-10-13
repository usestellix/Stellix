import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "wxt";
import { bundleModulesReport } from "./build/bundle-modules-report.js";

const OUTPUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), ".output");

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
  modules: ["@wxt-dev/module-react"],
  // Explicit imports only: every dependency of a file is visible in the file.
  imports: false,
  manifest: {
    name: "Stellix",
    description: "Non-custodial Stellar wallet",
    // CLAUDE.md §6.11: exactly these two. Adding one requires an ADR.
    // `wxt` (dev mode only) adds tabs/scripting/host permissions for hot reload; see ADR 0004.
    permissions: ["storage", "alarms"],
  },
  vite: () => ({
    plugins: [tailwindcss(), bundleModulesReport(OUTPUT_DIR)],
  }),
});
