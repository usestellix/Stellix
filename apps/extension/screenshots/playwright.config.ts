import { defineConfig } from "@playwright/test";

// Screenshots for PRs, not tests: `pnpm screenshots:findings`. Serves the harness built into
// .output-screenshots/ and writes PNGs to .output-screenshots/png/.
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  workers: 1,
  reporter: "list",
  webServer: {
    command: "pnpm exec vite preview -c findings/vite.config.ts --port 4179 --strictPort",
    port: 4179,
    reuseExistingServer: false,
  },
  use: { baseURL: "http://localhost:4179" },
});
