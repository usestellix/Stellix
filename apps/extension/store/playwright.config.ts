import { defineConfig } from "@playwright/test";

// Store graphics (docs/store/listing.md), not tests: `pnpm store:assets`. Uses live testnet.
export default defineConfig({
  testDir: ".",
  timeout: 240_000,
  workers: 1,
  reporter: "list",
});
