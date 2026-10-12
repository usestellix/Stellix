import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";

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
    plugins: [tailwindcss()],
  }),
});
