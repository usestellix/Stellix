import type { Page } from "@playwright/test";
import {
  Account,
  Asset,
  Keypair,
  Memo,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk/base";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  NETWORKS,
  createHorizonClient,
  fundWithFriendbot,
} from "../../../packages/core/src/index.js";
import { expect, test } from "../e2e/fixtures.js";
import { activeAddress, createWalletViaUi, openOnboarding, openPopup } from "../e2e/helpers.js";

// Chrome Web Store graphics from the real extension on live testnet (docs/store/listing.md):
// five 1280x800 screenshots (full bleed) and the 440x280 small promo tile. Each screenshot is the
// popup at its real 360x600 size on the app's canvas colour, with one plain caption.

const OUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../docs/store/assets",
);
const ICON = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public/icon/128.png");
const nodeFetch = { fetch: globalThis.fetch.bind(globalThis) };
const horizon = createHorizonClient(NETWORKS.testnet.horizonUrl, nodeFetch);

async function pay(from: Keypair, to: string, amount: string, memo: Memo) {
  const account = await horizon.getAccount(from.publicKey());
  if (account === null) throw new Error("payer is not funded");
  const tx = new TransactionBuilder(new Account(from.publicKey(), account.sequence), {
    fee: "100",
    networkPassphrase: NETWORKS.testnet.passphrase,
  })
    .addOperation(Operation.payment({ destination: to, asset: Asset.native(), amount }))
    .addMemo(memo)
    .setTimeout(180)
    .build();
  tx.sign(from);
  const { hash } = await horizon.submitTransactionAsync(tx.toXdr());
  for (let i = 0; i < 30 && (await horizon.getTransaction(hash)) === null; i++) {
    await new Promise((r) => setTimeout(r, 1_000));
  }
}

/** The popup at 2x for sharpness, as a data URI. */
async function shot(page: Page): Promise<string> {
  const png = await page.screenshot({ scale: "device" });
  return `data:image/png;base64,${png.toString("base64")}`;
}

/** Composes one 1280x800 store screenshot from a popup capture and a caption. */
async function compose(page: Page, file: string, popup: string, title: string, line: string) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(`<!doctype html><html><head><style>
    body{margin:0;width:1280px;height:800px;background:#f6f6f5;display:flex;align-items:center;
      font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#111113}
    .copy{width:520px;margin-left:120px}
    h1{font-size:44px;line-height:1.1;letter-spacing:-0.02em;font-weight:650;margin:0 0 16px}
    p{font-size:20px;line-height:1.5;color:#6c6c73;margin:0}
    img{width:360px;height:600px;margin-left:120px;border-radius:14px;
      box-shadow:0 0 0 1px rgb(17 17 19/.09),0 1px 2px rgb(17 17 19/.04),0 12px 32px rgb(17 17 19/.10)}
  </style></head><body><div class="copy"><h1>${title}</h1><p>${line}</p></div><img src="${popup}"></body></html>`);
  await page.screenshot({ path: path.join(OUT, file) });
}

test("store graphics", async ({ context, extensionId }) => {
  // Onboarding: the phrase grid before reveal (the words are never in the DOM until revealed).
  const onboarding = await openOnboarding(context, extensionId);
  await onboarding.setViewportSize({ width: 1280, height: 800 });
  await onboarding.emulateMedia({ reducedMotion: "reduce" }); // no mid-fade capture
  await onboarding.getByRole("button", { name: "Create a new wallet" }).click();
  await expect(onboarding.getByTestId("phrase-grid")).toHaveAttribute("data-revealed", "false");
  await onboarding.waitForTimeout(600); // let any remaining transition settle
  await onboarding.screenshot({ path: path.join(OUT, "screenshot-5-backup.png") });
  await onboarding.close();

  await createWalletViaUi(context, extensionId);
  const popup = await openPopup(context, extensionId);
  await popup.setViewportSize({ width: 360, height: 600 });
  const me = (await activeAddress(popup)).replaceAll(" ", "");
  const peer = Keypair.random();
  await fundWithFriendbot("testnet", me, horizon, nodeFetch);
  await fundWithFriendbot("testnet", peer.publicKey(), horizon, nodeFetch);
  await pay(peer, me, "250", Memo.text("Invoice 1042"));
  await pay(peer, me, "42.5", Memo.text("Lunch"));
  await popup.reload();
  await expect(popup.getByTestId("activity-row")).toHaveCount(3, { timeout: 30_000 });
  const home = await shot(popup);

  // Send review: built from the transaction that will be signed.
  await popup.getByRole("button", { name: "Send", exact: true }).click();
  await popup.getByTestId("send-destination").fill(peer.publicKey());
  await popup.getByTestId("send-amount").click();
  await popup.getByTestId("send-amount").fill("120");
  await popup.getByRole("button", { name: "Add memo" }).click();
  await popup.getByTestId("send-memo").fill("Rent October");
  await popup.getByRole("button", { name: "Continue" }).click();
  await expect(popup.getByTestId("popup")).toHaveAttribute("data-screen", "send-review", {
    timeout: 30_000,
  });
  const review = await shot(popup);
  await popup.getByRole("button", { name: "Confirm and send" }).click();
  await expect(popup.getByTestId("result")).toHaveAttribute("data-status", "success", {
    timeout: 60_000,
  });
  await popup.getByRole("button", { name: "Done" }).click();

  // Receive with a payment request.
  await popup.getByRole("button", { name: "Receive", exact: true }).click();
  await popup.getByRole("button", { name: "Request a specific amount" }).click();
  await popup.getByTestId("request-amount").fill("25");
  await popup.getByTestId("request-memo").fill("Order 77");
  await popup.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  await expect(popup.getByTestId("qr")).toBeVisible();
  const receive = await shot(popup);
  await popup.getByRole("button", { name: "Back" }).click();

  // Activity.
  await expect(popup.getByTestId("activity-row")).toHaveCount(4, { timeout: 30_000 });
  await popup.getByRole("button", { name: "View all" }).click();
  await expect(popup.getByTestId("history-end")).toBeVisible({ timeout: 15_000 });
  const activity = await shot(popup);

  const page = await context.newPage();
  await compose(
    page,
    "screenshot-1-home.png",
    home,
    "Your keys stay on your device",
    "A non-custodial Stellar wallet. Your recovery phrase is encrypted with your password and never leaves this browser.",
  );
  await compose(
    page,
    "screenshot-2-review.png",
    review,
    "Approve exactly what you sign",
    "The review is decoded from the transaction itself: destination, amount, memo and network fee.",
  );
  await compose(
    page,
    "screenshot-3-receive.png",
    receive,
    "Receive with a QR code or a payment link",
    "Share your address, or request an exact amount with a SEP-7 link.",
  );
  await compose(
    page,
    "screenshot-4-activity.png",
    activity,
    "Activity, as it happens",
    "Incoming payments appear while the wallet is open, with their memos.",
  );

  // Small promo tile, 440x280.
  const icon = `data:image/png;base64,${readFileSync(ICON).toString("base64")}`;
  await page.setViewportSize({ width: 440, height: 280 });
  await page.setContent(`<!doctype html><html><body style="margin:0;width:440px;height:280px;background:#f6f6f5;display:flex;align-items:center;justify-content:center;gap:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#111113">
    <img src="${icon}" width="96" height="96" style="margin:-16px">
    <div style="margin-left:16px"><div style="font-size:40px;font-weight:650;letter-spacing:-0.02em">Stellix</div>
    <div style="font-size:17px;color:#6c6c73;margin-top:4px">Non-custodial Stellar wallet</div></div></body></html>`);
  await page.screenshot({ path: path.join(OUT, "promo-small.png") });
});
