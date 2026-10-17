import type { BrowserContext, Page } from "@playwright/test";
import { expect } from "./fixtures.js";

export const PASSWORD = "correct horse battery";

export async function openPopup(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  return page;
}

export async function openOnboarding(context: BrowserContext, extensionId: string): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/onboarding.html`);
  await expect(page.getByTestId("onboarding-start")).toBeVisible();
  return page;
}

export async function setPassword(page: Page): Promise<void> {
  await expect(page.getByTestId("onboarding-password")).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create wallet" }).click();
  await expect(page.getByTestId("onboarding-done")).toBeVisible({ timeout: 15_000 });
}

/** Create flow through the real UI. Returns the phrase the page displayed. */
export async function createWalletViaUi(
  context: BrowserContext,
  extensionId: string,
): Promise<string[]> {
  const page = await openOnboarding(context, extensionId);
  await page.getByRole("button", { name: "Create a new wallet" }).click();
  const grid = page.getByTestId("phrase-grid");
  await expect(grid).toHaveAttribute("data-revealed", "false");
  await expect(page.getByTestId("phrase-word-1")).toHaveText("•••••"); // not in the DOM until revealed
  await expect(page.getByRole("button", { name: "I've written it down" })).toBeDisabled();

  await page.getByRole("button", { name: "Reveal" }).click();
  await expect(grid).toHaveAttribute("data-revealed", "true");
  const words: string[] = [];
  for (let i = 1; i <= 12; i++)
    words.push((await page.getByTestId(`phrase-word-${String(i)}`).innerText()).trim());
  await page.getByRole("button", { name: "I've written it down" }).click();

  const inputs = page.locator('[data-testid^="verify-word-"]');
  await expect(inputs).toHaveCount(3);
  for (const input of await inputs.all()) {
    const position = Number((await input.getAttribute("data-testid"))?.replace("verify-word-", ""));
    await input.fill(words[position - 1] ?? "");
  }
  await page.getByRole("button", { name: "Continue" }).click();
  await setPassword(page);
  await page.close();
  return words;
}

/** Import flow through the real UI, using paste-to-fill. */
export async function importWalletViaUi(
  context: BrowserContext,
  extensionId: string,
  phrase: string,
): Promise<void> {
  const page = await openOnboarding(context, extensionId);
  await page.getByRole("button", { name: "I already have a recovery phrase" }).click();
  const first = page.getByTestId("import-word-1");
  await first.focus();
  await first.evaluate((el, text) => {
    const data = new DataTransfer();
    data.setData("text", text);
    el.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
    );
  }, phrase);
  await expect(page.getByTestId("import-word-12")).toHaveValue(phrase.split(" ")[11] ?? "");
  await page.getByRole("button", { name: "Continue" }).click();
  await setPassword(page);
  await page.close();
}

/** The active account's full address, read from the Receive screen (Home shows it truncated). */
export async function activeAddress(popup: Page): Promise<string> {
  await popup.getByRole("button", { name: "Receive", exact: true }).click();
  await expect(popup.getByTestId("popup")).toHaveAttribute("data-screen", "receive");
  const text = await popup.getByTestId("full-address").innerText();
  await popup.getByRole("button", { name: "Back" }).click();
  await expect(popup.getByTestId("popup")).toHaveAttribute("data-screen", "home");
  return text;
}

/** Sends a raw request from a page's context, as that page would. */
export async function sendFrom(page: Page, type: string, payload?: unknown): Promise<unknown> {
  return page.evaluate(
    ([t, p]) => chrome.runtime.sendMessage({ id: crypto.randomUUID(), type: t, payload: p }),
    [type, payload] as const,
  );
}

declare const chrome: { runtime: { sendMessage(message: unknown): Promise<unknown> } };
