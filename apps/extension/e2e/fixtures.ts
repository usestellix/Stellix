import { test as base, chromium, type BrowserContext, type Worker } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Loads the unpacked built extension in a persistent Chromium context
// (https://playwright.dev/docs/chrome-extensions, TESTING §3).
// STELLIX_EXTENSION_DIR overrides the path, e.g. to point at the `wxt` dev build.
const EXTENSION_DIR =
  process.env.STELLIX_EXTENSION_DIR ??
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.output/chrome-mv3");

interface Fixtures {
  context: BrowserContext;
  serviceWorker: Worker;
  extensionId: string;
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructuring form.
  context: async ({}, use) => {
    const userDataDir = mkdtempSync(path.join(tmpdir(), "stellix-e2e-"));
    const context = await chromium.launchPersistentContext(userDataDir, {
      // The bundled `chromium` channel supports extensions in headless mode.
      channel: "chromium",
      args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
    });
    await use(context);
    await context.close();
    rmSync(userDataDir, { recursive: true, force: true });
  },
  serviceWorker: async ({ context }, use) => {
    const [existing] = context.serviceWorkers();
    await use(existing ?? (await context.waitForEvent("serviceworker")));
  },
  extensionId: async ({ serviceWorker }, use) => {
    // chrome-extension://<id>/background.js
    const id = new URL(serviceWorker.url()).host;
    await use(id);
  },
});

export const expect = test.expect;
