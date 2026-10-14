import type { BrowserContext, Page } from "@playwright/test";
import {
  NETWORKS,
  createHorizonClient,
  derivePublicKeys,
  fundWithFriendbot,
  generateMnemonic,
} from "../../../packages/core/src/index.js";
import { expect, test } from "./fixtures.js";
import { PASSWORD, createWalletViaUi, importWalletViaUi, openPopup, sendFrom } from "./helpers.js";

// M2 flows against live testnet (TESTING §3). Fresh keys every run (TESTING §2).

const nodeFetch = { fetch: globalThis.fetch.bind(globalThis) };
const horizon = createHorizonClient(NETWORKS.testnet.horizonUrl, nodeFetch);

async function fund(address: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await fundWithFriendbot("testnet", address, horizon, nodeFetch);
      return;
    } catch (err: unknown) {
      if (attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 2_000));
    }
  }
}

async function popupAt(
  context: BrowserContext,
  extensionId: string,
  screen: string,
): Promise<Page> {
  const popup = await openPopup(context, extensionId);
  await popup.setViewportSize({ width: 360, height: 600 });
  await expect(popup.getByTestId("popup")).toHaveAttribute("data-screen", screen);
  return popup;
}

async function openSettings(popup: Page, row: string): Promise<void> {
  await popup.getByRole("button", { name: "Settings" }).click();
  await popup.getByRole("button", { name: row }).click();
}

test("flow 1 (complete): create → popup → Fund with Friendbot → balance shows", async ({
  context,
  extensionId,
}) => {
  test.setTimeout(120_000);
  await createWalletViaUi(context, extensionId);
  const popup = await popupAt(context, extensionId, "home");
  const card = popup.getByTestId("balance-card");
  await expect(card).toHaveAttribute("data-state", "unfunded");
  await expect(card).toContainText("isn't active on Stellar yet.");

  await popup.getByRole("button", { name: "Fund with Friendbot" }).click();
  await expect(card).toHaveAttribute("data-state", "funded", { timeout: 60_000 });
  await expect(popup.getByTestId("balance-total")).toHaveText("10,000 XLM");
  await expect(popup.getByTestId("balance-available")).toHaveText("9,999 XLM");
  await expect(popup.getByTestId("balance-reserved")).toHaveText("1 XLM");

  await popup.getByRole("button", { name: "What's reserved?" }).click();
  await expect(card).toContainText("Stellar keeps a small amount of XLM locked");
});

test("network error shows the last known balance, greyed with its time", async ({
  context,
  extensionId,
}) => {
  test.setTimeout(120_000);
  await createWalletViaUi(context, extensionId);
  const popup = await popupAt(context, extensionId, "home");
  await popup.getByRole("button", { name: "Fund with Friendbot" }).click();
  await expect(popup.getByTestId("balance-card")).toHaveAttribute("data-state", "funded", {
    timeout: 60_000,
  });

  await context.route("https://horizon-testnet.stellar.org/**", (route) => route.abort());
  const offline = await popupAt(context, extensionId, "home");
  await expect(offline.getByTestId("balance-card")).toHaveAttribute("data-state", "error", {
    timeout: 30_000,
  });
  await expect(offline.getByTestId("balance-stale")).toContainText("Last known balance, as of");
  await expect(offline.getByTestId("balance-stale")).toContainText("10,000 XLM");
  await expect(offline.getByRole("alert")).toHaveText(/Couldn't reach the Stellar network/);
  await context.unroute("https://horizon-testnet.stellar.org/**");
});

test("import discovers previously used accounts on testnet", async ({ context, extensionId }) => {
  test.setTimeout(150_000);
  const mnemonic = generateMnemonic();
  const keys = await derivePublicKeys(mnemonic, [0, 1]);
  await fund(keys[0]!);
  await fund(keys[1]!);

  await importWalletViaUi(context, extensionId, mnemonic);
  const popup = await popupAt(context, extensionId, "home");
  await popup.getByRole("button", { name: "Switch account" }).click();
  await expect(popup.getByTestId("popup")).toHaveAttribute("data-screen", "accounts");
  await expect(popup.locator('[data-testid^="account-row-"]')).toHaveCount(2);
  await expect(popup.getByTestId("account-row-1").getByTestId("account-balance")).toHaveText(
    "10,000 XLM",
    {
      timeout: 30_000,
    },
  );
});

test("accounts: add, rename, switch", async ({ context, extensionId }) => {
  await createWalletViaUi(context, extensionId);
  const popup = await popupAt(context, extensionId, "home");
  await popup.getByRole("button", { name: "Switch account" }).click();
  await popup.getByRole("button", { name: "Add account" }).click();
  await expect(popup.getByTestId("account-row-1")).toContainText("Account 2");

  await popup.getByRole("button", { name: "Rename Account 2" }).click();
  await popup.getByLabel("Rename Account 2").fill("Savings");
  await popup.getByRole("button", { name: "Save" }).click();
  await expect(popup.getByTestId("account-row-1")).toContainText("Savings");

  await popup.getByTestId("account-row-1").getByRole("button").first().click();
  await expect(popup.getByTestId("popup")).toHaveAttribute("data-screen", "home");
  await expect(popup.getByTestId("account-label")).toHaveText("Savings");
});

test("flow 7: mainnet switch needs confirmation; the SW also refuses it without acknowledgement", async ({
  context,
  extensionId,
}) => {
  await createWalletViaUi(context, extensionId);
  const popup = await popupAt(context, extensionId, "home");

  expect(await sendFrom(popup, "SET_SETTINGS", { network: "mainnet" })).toMatchObject({
    ok: false,
    error: { code: "INVALID_REQUEST" },
  });

  await openSettings(popup, "Network");
  const dialog = popup.getByTestId("mainnet-dialog");
  await popup.getByRole("radio", { name: /Mainnet/ }).click();
  await expect(dialog).toBeVisible();
  const confirm = dialog.getByRole("button", { name: "Switch", exact: true });
  await expect(confirm).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  await expect(popup.getByTestId("network-badge")).toHaveText(/^testnet$/i);

  await popup.getByRole("radio", { name: /Mainnet/ }).click();
  await dialog.getByRole("checkbox", { name: "I understand this uses real XLM" }).check();
  await confirm.click();
  await expect(dialog).toBeHidden();
  await expect(popup.getByTestId("network-badge")).toHaveText(/^mainnet$/i);

  await popup.getByRole("button", { name: "Back" }).click();
  await popup.getByRole("button", { name: "Back" }).click();
  await expect(popup.getByTestId("network-badge")).toHaveText(/^mainnet$/i);
  // A fresh key is unfunded on mainnet, and there is no Friendbot there. No transactions in E2E.
  await expect(popup.getByTestId("balance-card")).toHaveAttribute("data-state", "unfunded", {
    timeout: 30_000,
  });
  await expect(popup.getByRole("button", { name: "Fund with Friendbot" })).toHaveCount(0);
});

test("settings: auto-lock timer, custom Horizon, about", async ({ context, extensionId }) => {
  test.setTimeout(90_000);
  await createWalletViaUi(context, extensionId);
  const popup = await popupAt(context, extensionId, "home");

  await openSettings(popup, "Auto-lock");
  await popup.getByRole("radio", { name: "5 minutes", exact: true }).click();
  await expect(popup.getByRole("radio", { name: "5 minutes", exact: true })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await popup.getByRole("button", { name: "Back" }).click();
  await expect(popup.getByRole("button", { name: /Auto-lock/ })).toContainText("5 min");

  await popup.getByRole("button", { name: /Custom Horizon URL/ }).click();
  const url = popup.getByLabel("Horizon URL for Testnet");
  await url.fill("http://horizon-testnet.stellar.org");
  await popup.getByRole("button", { name: "Save" }).click();
  await expect(popup.getByRole("alert")).toHaveText(/isn't valid for the selected network/);
  await url.fill("https://horizon-testnet.stellar.org/");
  await popup.getByRole("button", { name: "Save" }).click();
  await expect(popup.getByText("Saved.", { exact: false })).toBeVisible({ timeout: 30_000 });
  await popup.getByRole("button", { name: "Use default" }).click();
  await expect(popup.getByRole("button", { name: "Use default" })).toBeDisabled();

  await popup.getByRole("button", { name: "Back" }).click();
  await popup.getByRole("button", { name: "About Stellix" }).click();
  await expect(popup.getByTestId("about-version")).toHaveText(/^\d+\.\d+\.\d+$/);
  await expect(popup.getByTestId("about-build")).toHaveText(/^[0-9a-f]{12}$/);
});

test("security: change password, reveal phrase in its own tab, then reset", async ({
  context,
  extensionId,
}) => {
  test.setTimeout(90_000);
  const words = await createWalletViaUi(context, extensionId);
  const popup = await popupAt(context, extensionId, "home");

  await openSettings(popup, "Change password");
  await popup.getByLabel("Current password").fill(PASSWORD);
  await popup.getByLabel("New password", { exact: true }).fill("a brand new password");
  await popup.getByLabel("Confirm new password").fill("a brand new password");
  await popup.getByRole("button", { name: "Change password" }).click();
  await expect(popup.getByRole("status")).toHaveText("Password changed.", { timeout: 15_000 });

  await popup.getByRole("button", { name: "Back" }).click();
  const tabPromise = context.waitForEvent("page", (p) =>
    p.url().includes("onboarding.html?mode=reveal"),
  );
  await popup.getByRole("button", { name: "Reveal recovery phrase" }).click();
  const tab = await tabPromise;
  await tab.getByLabel("Password").fill(PASSWORD); // the old password no longer works
  await tab.getByRole("button", { name: "Continue" }).click();
  await expect(tab.getByRole("alert")).toHaveText(/That password isn't right/, { timeout: 15_000 });
  await tab.getByLabel("Password").fill("a brand new password");
  await tab.getByRole("button", { name: "Continue" }).click();
  await expect(tab.getByTestId("phrase-grid")).toHaveAttribute("data-revealed", "false", {
    timeout: 15_000,
  });
  await tab.getByRole("button", { name: "Reveal" }).click();
  for (let i = 1; i <= 12; i++)
    await expect(tab.getByTestId(`phrase-word-${String(i)}`)).toHaveText(words[i - 1]!);
  await tab.close();

  const fresh = await popupAt(context, extensionId, "home");
  await openSettings(fresh, "Reset wallet");
  const erase = fresh.getByRole("button", { name: "Erase and reset" });
  await expect(erase).toBeDisabled();
  await fresh.getByLabel("Type RESET to confirm").fill("RESET");
  const onboarding = context.waitForEvent("page", (p) => p.url().endsWith("/onboarding.html"));
  await erase.click();
  await expect((await onboarding).getByTestId("onboarding-start")).toBeVisible();
  await expect(fresh.getByTestId("popup")).toHaveAttribute("data-screen", "welcome");
});

test("import screen shows the approved note", async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/onboarding.html`);
  await page.getByRole("button", { name: "I already have a recovery phrase" }).click();
  await expect(page.getByTestId("onboarding-import")).toContainText(
    "Importing doesn't move your funds. This phrase still controls the same accounts in any other wallet where you've used it. Anyone with this phrase can take your funds.",
  );
});
