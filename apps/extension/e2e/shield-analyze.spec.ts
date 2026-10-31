import type { Page } from "@playwright/test";
import {
  Account,
  Asset,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  type xdr,
} from "@stellar/stellar-sdk/base";
import { expect, test } from "./fixtures.js";
import { activeAddress, createWalletViaUi, openPopup } from "./helpers.js";

// Analyze (Mode C, #35) in the built extension against live testnet. Transactions are built
// offline for the E2E wallet's own account; none is submitted.

/** Request types that sign, or create something that could be signed. */
const SIGNING_TYPES = ["PREPARE_PAYMENT", "CONFIRM_PAYMENT"];

function tx(source: string, op: xdr.Operation): string {
  return new TransactionBuilder(new Account(source, "1"), {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(op)
    .setTimeout(180)
    .build()
    .toXdr();
}

/** Every request type the page sends to the service worker, in order. */
async function sentTypes(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __sent: string[] }).__sent);
}

async function openAnalyze(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await expect(page.getByTestId("popup")).toHaveAttribute("data-screen", "analyze");
}

async function analyze(page: Page, input: string): Promise<void> {
  await page.getByTestId("analyze-input").fill(input);
  await page.getByTestId("analyze-submit").click();
  await expect(page.getByTestId("analyze-report")).toBeVisible({ timeout: 30_000 });
}

test("a blocked case shows the banner, and the screen can't reach signing", async ({
  context,
  extensionId,
}) => {
  test.setTimeout(90_000);
  // Record every message the popup sends, before its scripts run.
  await context.addInitScript(() => {
    const w = window as unknown as {
      __sent: string[];
      chrome?: { runtime?: { sendMessage?: (m: unknown) => Promise<unknown> } };
    };
    w.__sent = [];
    const runtime = w.chrome?.runtime;
    const original = runtime?.sendMessage?.bind(runtime);
    if (runtime === undefined || original === undefined) return;
    runtime.sendMessage = (m: unknown) => {
      w.__sent.push((m as { type?: string }).type ?? "");
      return original(m);
    };
  });
  await createWalletViaUi(context, extensionId);
  const popup = await openPopup(context, extensionId);
  await popup.setViewportSize({ width: 360, height: 600 });
  const address = (await activeAddress(popup)).replaceAll(" ", "");

  await openAnalyze(popup);
  const addSigner = tx(
    address,
    Operation.setOptions({ signer: { ed25519PublicKey: Keypair.random().publicKey(), weight: 1 } }),
  );
  await analyze(popup, addSigner);

  await expect(popup.getByTestId("analyze-report")).toHaveAttribute("data-decision", "blocked");
  await expect(popup.getByTestId("would-block")).toContainText("Stellix would block this");
  await expect(popup.locator('[data-rule="ACCT_SIGNER_CHANGE"]')).toBeVisible();
  await expect(popup.getByTestId("analyzed-for")).toContainText(
    `${address.slice(0, 4)}…${address.slice(-4)}`,
  );
  await expect(popup.getByTestId("not-spending")).toHaveCount(0);
  await expect(popup.getByText(/\bsafe\b/i)).toHaveCount(0);

  // The screen offers nothing but going back, clearing and analyzing again.
  const buttons = await popup.getByRole("button").allInnerTexts();
  expect(buttons.map((b) => b.trim()).filter((b) => b !== "")).toEqual(["Clear", "Analyze"]);
  await expect(popup.getByRole("button", { name: "Back" })).toBeVisible();

  const sent = await sentTypes(popup);
  expect(sent).toContain("SHIELD_ANALYZE");
  expect(sent.filter((t) => SIGNING_TYPES.includes(t))).toEqual([]);
});

test("a transaction that doesn't touch the active account says so", async ({
  context,
  extensionId,
}) => {
  test.setTimeout(90_000);
  await createWalletViaUi(context, extensionId);
  const popup = await openPopup(context, extensionId);
  await popup.setViewportSize({ width: 360, height: 600 });
  await openAnalyze(popup);
  const foreign = tx(
    Keypair.random().publicKey(),
    Operation.payment({
      destination: Keypair.random().publicKey(),
      asset: Asset.native(),
      amount: "1",
    }),
  );
  await analyze(popup, foreign);
  await expect(popup.getByTestId("not-spending")).toContainText(
    "This transaction doesn't spend from your active account.",
  );
});

test("a mainnet link on testnet is refused with a specific message", async ({
  context,
  extensionId,
}) => {
  await createWalletViaUi(context, extensionId);
  const popup = await openPopup(context, extensionId);
  await popup.setViewportSize({ width: 360, height: 600 });
  await openAnalyze(popup);
  const link = `web+stellar:tx?xdr=${encodeURIComponent(
    tx(Keypair.random().publicKey(), Operation.bumpSequence({ bumpTo: "2" })),
  )}`;
  await popup.getByTestId("analyze-input").fill(link);
  await popup.getByTestId("analyze-submit").click();
  await expect(popup.getByText("This link is for Mainnet", { exact: false })).toBeVisible();
  await expect(popup.getByTestId("analyze-report")).toHaveCount(0);
});
