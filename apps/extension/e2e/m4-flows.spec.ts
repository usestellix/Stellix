import type { BrowserContext, Page } from "@playwright/test";
import {
  Account,
  Asset,
  Keypair,
  Memo,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk/base";
import {
  NETWORKS,
  createHorizonClient,
  fundWithFriendbot,
} from "../../../packages/core/src/index.js";
import { expect, test } from "./fixtures.js";
import { activeAddress, createWalletViaUi, openPopup } from "./helpers.js";

// M4 flows (ROADMAP M4 exit): Receive (QR, copy, SEP-7 link); an incoming payment appears live
// while the popup is open; payments made while it was closed appear on reopen; history
// paginates to the account's origin; memos shown; fee only for the fee account.

const nodeFetch = { fetch: globalThis.fetch.bind(globalThis) };
const horizon = createHorizonClient(NETWORKS.testnet.horizonUrl, nodeFetch);
const TESTNET_PASSPHRASE = "Test%20SDF%20Network%20%3B%20September%202015";

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

/** Pays `to` from a Node-side account: `ops` payments of `amount` in one transaction. */
async function pay(from: Keypair, to: string, amount: string, memo: Memo = Memo.none(), ops = 1) {
  const account = await horizon.getAccount(from.publicKey());
  let builder = new TransactionBuilder(new Account(from.publicKey(), account!.sequence), {
    fee: "100",
    networkPassphrase: NETWORKS.testnet.passphrase,
  });
  for (let i = 0; i < ops; i++) {
    builder = builder.addOperation(
      Operation.payment({ destination: to, asset: Asset.native(), amount }),
    );
  }
  const tx = builder.addMemo(memo).setTimeout(180).build();
  tx.sign(from);
  const { hash } = await horizon.submitTransactionAsync(tx.toXdr());
  for (let i = 0; i < 30; i++) {
    if ((await horizon.getTransaction(hash)) !== null) return;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error("payment not included");
}

async function wallet(context: BrowserContext, extensionId: string) {
  await createWalletViaUi(context, extensionId);
  const popup = await openPopup(context, extensionId);
  await popup.setViewportSize({ width: 360, height: 600 });
  const me = (await activeAddress(popup)).replaceAll(" ", "");
  return { popup, me };
}

async function fundedWallet(context: BrowserContext, extensionId: string) {
  const w = await wallet(context, extensionId);
  await fund(w.me);
  await w.popup.reload();
  await expect(w.popup.getByTestId("balance-card")).toHaveAttribute("data-state", "funded", {
    timeout: 30_000,
  });
  return w;
}

const rows = (popup: Page) => popup.getByTestId("activity-row");

test("Receive: address QR, copy, and a SEP-7 request link", async ({ context, extensionId }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const { popup, me } = await wallet(context, extensionId);
  // PRODUCT §4.4: Home's header copies the full address next to the truncated one.
  await popup.getByTestId("header-copy").click();
  await expect(popup.getByTestId("header-copy")).toHaveAccessibleName("Copied");
  expect(await popup.evaluate(() => navigator.clipboard.readText())).toBe(me);
  await popup.evaluate(() => navigator.clipboard.writeText(""));

  await popup.getByRole("button", { name: "Receive" }).click();
  await expect(popup.getByTestId("qr")).toHaveAttribute("data-value", me);
  await expect(popup.getByText("Send at least 1 XLM to activate this account.")).toBeVisible();
  await expect(popup.getByText("This is a testnet address — test XLM has no value.")).toBeVisible();

  await popup.getByTestId("copy-address").click();
  await expect(popup.getByTestId("copy-address")).toHaveText("Copied");
  expect(await popup.evaluate(() => navigator.clipboard.readText())).toBe(me);
  await expect(popup.getByTestId("copy-address")).toHaveText("Copy address", { timeout: 3_000 });

  await popup.getByRole("button", { name: "Request a specific amount" }).click();
  await expect(popup.getByTestId("qr-placeholder")).toBeVisible();
  await expect(popup.getByTestId("copy-link")).toBeDisabled();
  await popup.getByTestId("request-amount").fill("1.123456789");
  await expect(popup.getByTestId("qr-placeholder")).toBeVisible();
  await expect(popup.getByText("at most 7 decimal places", { exact: false })).toBeVisible();

  await popup.getByTestId("request-amount").fill("12.50");
  await popup.getByTestId("request-memo").fill("inv 7");
  const uri = `web+stellar:pay?destination=${me}&amount=12.5&memo=inv%207&memo_type=MEMO_TEXT&network_passphrase=${TESTNET_PASSPHRASE}`;
  await expect(popup.getByTestId("qr")).toHaveAttribute("data-value", uri);
  await expect(popup.getByTestId("request-caption")).toHaveText("Requesting 12.5 XLM");
  await popup.getByTestId("copy-link").click();
  await expect(popup.getByTestId("copy-link")).toHaveText("Copied");
  expect(await popup.evaluate(() => navigator.clipboard.readText())).toBe(uri);

  await popup.getByRole("button", { name: "Remove amount" }).click();
  await expect(popup.getByTestId("qr")).toHaveAttribute("data-value", me);
});

test("an incoming payment appears live, with its memo, and updates the balance", async ({
  context,
  extensionId,
}) => {
  test.setTimeout(150_000);
  const { popup, me } = await fundedWallet(context, extensionId);
  await expect(rows(popup)).toHaveCount(1, { timeout: 15_000 }); // Friendbot's activation
  const peer = Keypair.random();
  await fund(peer.publicKey());

  // Popup stays open on Home: no reload from here on.
  await pay(peer, me, "7.5", Memo.text("live ✓"));
  await expect(rows(popup)).toHaveCount(2, { timeout: 30_000 });
  const row = rows(popup).first();
  await expect(row).toContainText(`Received from ${peer.publicKey().slice(0, 4)}…`);
  await expect(row.getByTestId("activity-memo")).toHaveText("live ✓");
  await expect(row.getByTestId("activity-amount")).toHaveText("+7.5 XLM");
  await expect(popup.getByTestId("balance-total")).toHaveText("10,007.5 XLM", { timeout: 15_000 });

  // Detail: someone else paid the fee, so none is shown.
  await row.click();
  await expect(popup.getByTestId("detail-memo")).toHaveText("live ✓");
  await expect(popup.getByTestId("detail-fee")).toHaveCount(0);
  await expect(popup.getByRole("link", { name: "View on explorer" })).toHaveAttribute(
    "href",
    /^https:\/\/stellar\.expert\/explorer\/testnet\/tx\/[0-9a-f]{64}$/,
  );
});

test("payments made while the popup was closed appear on reopen (cache, then page 1)", async ({
  context,
  extensionId,
}) => {
  test.setTimeout(150_000);
  const { popup, me } = await fundedWallet(context, extensionId);
  await expect(rows(popup)).toHaveCount(1, { timeout: 15_000 });
  await popup.close(); // the first page is now cached in session storage
  const peer = Keypair.random();
  await fund(peer.publicKey());
  await pay(peer, me, "3", Memo.id("9001"));

  const reopened = await openPopup(context, extensionId);
  await expect(rows(reopened)).toHaveCount(2, { timeout: 30_000 });
  await expect(rows(reopened).first().getByTestId("activity-memo")).toHaveText("ID 9001");
});

test("history paginates through a 25-operation payment to the account's origin", async ({
  context,
  extensionId,
}) => {
  test.setTimeout(150_000);
  const { popup, me } = await fundedWallet(context, extensionId);
  const peer = Keypair.random();
  await fund(peer.publicKey());
  await pay(peer, me, "1", Memo.text("batch"), 25);
  await popup.reload();

  await expect(rows(popup)).toHaveCount(10, { timeout: 30_000 }); // Home: last 10
  await popup.getByRole("button", { name: "View all" }).click();
  await expect(popup.getByTestId("popup")).toHaveAttribute("data-screen", "history");
  await expect(rows(popup)).toHaveCount(20);
  await rows(popup).last().scrollIntoViewIfNeeded();
  await expect(rows(popup)).toHaveCount(26, { timeout: 15_000 });
  await expect(popup.getByTestId("history-end")).toHaveText("This is where your account started.");
  await expect(rows(popup).last()).toContainText("Account activated by");
  const ids = await rows(popup).evaluateAll((els) => els.map((e) => e.getAttribute("data-id")));
  expect(new Set(ids).size).toBe(26);
});
