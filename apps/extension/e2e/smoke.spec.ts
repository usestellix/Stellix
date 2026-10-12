import type { Browser } from "wxt/browser";
import { expect, test } from "./fixtures.js";

// `evaluate` callbacks run inside the extension, where the `chrome` global exists.
declare const chrome: typeof Browser;

test("service worker starts and exposes the extension ID", ({ extensionId }) => {
  expect(extensionId).toMatch(/^[a-p]{32}$/);
});

test("manifest permissions are exactly storage and alarms", async ({ serviceWorker }) => {
  test.skip(
    process.env.STELLIX_EXTENSION_DIR !== undefined,
    "dev builds add hot-reload permissions (ADR 0004)",
  );
  const manifest = await serviceWorker.evaluate(() => chrome.runtime.getManifest());
  expect(manifest.permissions).toEqual(["storage", "alarms"]);
  expect(manifest.host_permissions).toBeUndefined();
  expect(manifest.content_scripts).toBeUndefined();
  expect(manifest.externally_connectable).toBeUndefined();
  expect(manifest.web_accessible_resources).toBeUndefined();
  expect(manifest.content_security_policy).toBeUndefined();
});

test("popup shows status returned by the service worker", async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  await expect(popup.getByTestId("status")).toHaveAttribute("data-state", "ready");
  await expect(popup.getByTestId("status-has-vault")).toHaveText("No");
  await expect(popup.getByTestId("status-unlocked")).toHaveText("No");
  await expect(popup.getByTestId("status-active-account")).toHaveText("None");
  await expect(popup.getByTestId("network-badge")).toHaveText("TESTNET");
});

test("service worker set schemaVersion on first start", async ({ context, extensionId }) => {
  // Open a page first so the GET_STATUS round-trip guarantees startup has finished.
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByTestId("status")).toHaveAttribute("data-state", "ready");

  const stored = await popup.evaluate(() => chrome.storage.local.get("schemaVersion"));
  expect(stored).toEqual({ schemaVersion: 1 });
});

test("onboarding page loads", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/onboarding.html`);
  await expect(page.getByTestId("onboarding")).toBeVisible();
});

test("status survives service worker termination", async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByTestId("status")).toHaveAttribute("data-state", "ready");

  // Track the worker's running status via CDP (Playwright emits no event when an extension
  // worker restarts).
  const cdp = await context.newCDPSession(popup);
  const statuses: string[] = [];
  cdp.on("ServiceWorker.workerVersionUpdated", ({ versions }) => {
    for (const v of versions) {
      if (v.scriptURL.endsWith("/background.js")) statuses.push(v.runningStatus);
    }
  });
  await cdp.send("ServiceWorker.enable");

  // Kill the worker the way Chrome does when idle (TESTING §3 flow 5).
  await cdp.send("ServiceWorker.stopAllWorkers");
  await expect.poll(() => statuses.at(-1)).toBe("stopped");

  // The next message restarts the worker, which must re-run startup before answering.
  await popup.reload();
  await expect(popup.getByTestId("status")).toHaveAttribute("data-state", "ready");
  await expect(popup.getByTestId("network-badge")).toHaveText("TESTNET");
  expect(statuses.slice(statuses.lastIndexOf("stopped"))).toContain("running");
});
