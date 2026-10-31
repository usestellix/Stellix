import { defineConfig } from "@playwright/test";

// Component-level E2E for screens whose states the real extension can't reach today (#36).
// Serves the harness built into .output-harness/ by `pnpm test:harness`.
export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  workers: 1,
  reporter: process.env.CI === undefined ? "list" : [["list"], ["html", { open: "never" }]],
  webServer: {
    command: "pnpm exec vite preview -c review/vite.config.ts --port 4180 --strictPort",
    port: 4180,
    reuseExistingServer: false,
  },
  use: { baseURL: "http://localhost:4180" },
});
