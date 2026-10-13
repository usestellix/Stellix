import type { Browser } from "wxt/browser";
import { SEP0005_VECTORS } from "../../../packages/core/src/keys/__tests__/sep0005.vectors.js";
import { expect, test } from "./fixtures.js";
import { PASSWORD, createWalletViaUi, importWalletViaUi, openPopup, sendFrom } from "./helpers.js";

// `evaluate` callbacks run inside the extension, where the `chrome` global exists.
declare const chrome: typeof Browser;

// TESTING §3 flows for M1 (ROADMAP M1 exit). Friendbot/balance parts of flow 1 are M2.

const TEST5 = SEP0005_VECTORS.find((v) => v.test === 5)!;

test("flow 1: create wallet → verify words → password → popup unlocked", async ({
  context,
  extensionId,
}) => {
  await createWalletViaUi(context, extensionId);
  const popup = await openPopup(context, extensionId);
  await expect(popup.getByTestId("popup")).toHaveAttribute("data-screen", "unlocked");
  await expect(popup.getByTestId("account-label")).toHaveText("Account 1");
  await expect(popup.getByTestId("full-address")).toHaveText(/^G[A-Z2-7]{3}( [A-Z2-7]{4}){13}$/);
  await expect(popup.getByTestId("network-badge")).toHaveText(/^testnet$/i);
});

test("flow 2: import a known phrase → same G address as SEP-0005", async ({
  context,
  extensionId,
}) => {
  await importWalletViaUi(context, extensionId, TEST5.mnemonic);
  const popup = await openPopup(context, extensionId);
  await expect(popup.getByTestId("popup")).toHaveAttribute("data-screen", "unlocked");
  const shown = (await popup.getByTestId("full-address").innerText()).replaceAll(" ", "");
  expect(shown).toBe(TEST5.accounts[0]!.publicKey);
});

test("flow 4: lock → wrong password → error → correct password → unlocked", async ({
  context,
  extensionId,
}) => {
  await importWalletViaUi(context, extensionId, TEST5.mnemonic);
  const popup = await openPopup(context, extensionId);
  await popup.getByRole("button", { name: "Lock" }).click();
  await expect(popup.getByTestId("popup")).toHaveAttribute("data-screen", "unlock");

  await popup.getByLabel("Password").fill("not the password");
  await popup.getByRole("button", { name: "Unlock" }).click();
  await expect(popup.getByRole("alert")).toHaveText(/That password isn't right/);
  await expect(popup.getByTestId("popup")).toHaveAttribute("data-screen", "unlock");

  await popup.getByLabel("Password").fill(PASSWORD);
  await popup.getByRole("button", { name: "Unlock" }).click();
  await expect(popup.getByTestId("popup")).toHaveAttribute("data-screen", "unlocked");
});

test("unlock throttle is enforced by the SW, not the popup", async ({ context, extensionId }) => {
  await importWalletViaUi(context, extensionId, TEST5.mnemonic);
  const popup = await openPopup(context, extensionId);
  await sendFrom(popup, "LOCK");
  for (let i = 0; i < 5; i++) {
    expect(await sendFrom(popup, "UNLOCK", { password: "wrong password" })).toMatchObject({
      error: { code: "INVALID_PASSWORD" },
    });
  }
  // A brand-new popup page (fresh React state) is still throttled, even with the right password.
  const fresh = await openPopup(context, extensionId);
  await fresh.getByLabel("Password").fill(PASSWORD);
  await fresh.getByRole("button", { name: "Unlock" }).click();
  await expect(fresh.getByRole("alert")).toHaveText(/Too many attempts/);
});

test("flow 5: unlocked session survives service worker termination", async ({
  context,
  extensionId,
}) => {
  await importWalletViaUi(context, extensionId, TEST5.mnemonic);
  const popup = await openPopup(context, extensionId);
  await expect(popup.getByTestId("popup")).toHaveAttribute("data-screen", "unlocked");

  const cdp = await context.newCDPSession(popup);
  const statuses: string[] = [];
  cdp.on("ServiceWorker.workerVersionUpdated", ({ versions }) => {
    for (const v of versions)
      if (v.scriptURL.endsWith("/background.js")) statuses.push(v.runningStatus);
  });
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.stopAllWorkers");
  await expect.poll(() => statuses.at(-1)).toBe("stopped");

  await popup.reload();
  await expect(popup.getByTestId("popup")).toHaveAttribute("data-screen", "unlocked");
  expect(statuses.slice(statuses.lastIndexOf("stopped"))).toContain("running");
});

test("flow 6: auto-lock fires from the alarm after the idle timeout", async ({
  context,
  extensionId,
  serviceWorker,
}) => {
  test.setTimeout(90_000);
  await importWalletViaUi(context, extensionId, TEST5.mnemonic);
  // Simulate 16 idle minutes (default timeout 15). Settings UI for the timer is M2.
  await serviceWorker.evaluate(() =>
    chrome.storage.session.set({ lastActivityAt: Date.now() - 16 * 60_000 }),
  );
  // No request is sent, so only the 30 s alarm can lock it.
  await expect
    .poll(() => serviceWorker.evaluate(() => chrome.storage.session.get("sessionKey")), {
      timeout: 60_000,
      intervals: [2_000],
    })
    .toEqual({});
  const popup = await openPopup(context, extensionId);
  await expect(popup.getByTestId("popup")).toHaveAttribute("data-screen", "unlock");
  expect(await serviceWorker.evaluate(() => chrome.alarms.get("autolock"))).toBeUndefined();
});

test("the popup can never receive the recovery phrase", async ({ context, extensionId }) => {
  await importWalletViaUi(context, extensionId, TEST5.mnemonic);
  const popup = await openPopup(context, extensionId);
  for (const [type, payload] of [
    ["ONBOARD_GENERATE", undefined],
    ["REVEAL_PHRASE", { password: PASSWORD }],
  ] as const) {
    const res = await sendFrom(popup, type, payload);
    expect(res).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED_SENDER" } });
    expect(JSON.stringify(res)).not.toContain("abandon");
  }
});

test("reset wipes the wallet and reopens onboarding (no tabs permission needed)", async ({
  context,
  extensionId,
}) => {
  await importWalletViaUi(context, extensionId, TEST5.mnemonic);
  const popup = await openPopup(context, extensionId);
  const opened = context.waitForEvent("page", (p) => p.url().endsWith("/onboarding.html"));
  expect(await sendFrom(popup, "RESET_WALLET", { confirmation: "RESET" })).toMatchObject({
    ok: true,
  });
  const onboarding = await opened;
  await expect(onboarding.getByTestId("onboarding-start")).toBeVisible();
  const stored = await popup.evaluate(() => chrome.storage.local.get(null));
  expect(stored).toEqual({ schemaVersion: 1 });
});
