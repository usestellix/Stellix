import type { BrowserContext, Page } from "@playwright/test";
import { Account, Keypair, Operation, TransactionBuilder } from "@stellar/stellar-sdk/base";
import {
  NETWORKS,
  createHorizonClient,
  fundWithFriendbot,
} from "../../../packages/core/src/index.js";
import { expect, test } from "./fixtures.js";
import { activeAddress, createWalletViaUi, openPopup, sendFrom } from "./helpers.js";

// M3 flows against live testnet (TESTING §3 flow 3; M3 exit: killing the SW mid-submit still
// resolves to a definitive outcome). Flow 3's history assertion landed with M4.

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

async function nativeBalance(id: string): Promise<string | null> {
  const a = await horizon.getAccount(id);
  return a === null
    ? null
    : ((a.balances.find((b) => b.asset_type === "native") as { balance: string } | undefined)
        ?.balance ?? null);
}

/** Create a wallet, fund its first account from Node, and open Home with the balance loaded. */
async function fundedWallet(context: BrowserContext, extensionId: string): Promise<Page> {
  await createWalletViaUi(context, extensionId);
  const popup = await openPopup(context, extensionId);
  await popup.setViewportSize({ width: 360, height: 600 });
  const address = (await activeAddress(popup)).replaceAll(" ", "");
  await fund(address);
  await popup.reload();
  await expect(popup.getByTestId("balance-card")).toHaveAttribute("data-state", "funded", {
    timeout: 30_000,
  });
  return popup;
}

async function fillSend(popup: Page, destination: string, amount: string): Promise<void> {
  await popup.getByRole("button", { name: "Send", exact: true }).click();
  await expect(popup.getByTestId("popup")).toHaveAttribute("data-screen", "send-input");
  await popup.getByTestId("send-destination").fill(destination);
  await popup.getByTestId("send-amount").click(); // blur the destination → lookup
  await popup.getByTestId("send-amount").fill(amount);
}

test("flow 3: send to a fresh address activates it", async ({ context, extensionId }) => {
  test.setTimeout(150_000);
  const popup = await fundedWallet(context, extensionId);
  const fresh = Keypair.random().publicKey();
  await fillSend(popup, fresh, "2");
  await expect(popup.getByText("This address isn't active yet.", { exact: false })).toBeVisible({
    timeout: 15_000,
  });
  await popup.getByRole("button", { name: "Continue" }).click();

  await expect(popup.getByTestId("popup")).toHaveAttribute("data-screen", "send-review", {
    timeout: 30_000,
  });
  await expect(popup.getByTestId("review-type")).toHaveText("Activate new account");
  await expect(popup.getByTestId("review-destination")).toHaveText(
    fresh.match(/.{1,4}/g)!.join(" "),
  );
  await expect(popup.getByTestId("review-amount")).toHaveText("2 XLM");
  await expect(popup.getByTestId("network-badge").first()).toHaveText(/^testnet$/i);

  await popup.getByRole("button", { name: "Confirm and send" }).click();
  await expect(popup.getByTestId("result")).toHaveAttribute("data-status", "success", {
    timeout: 60_000,
  });
  expect(await nativeBalance(fresh)).toBe("2.0000000");

  await popup.getByRole("button", { name: "Done" }).click();
  await expect(popup.getByTestId("popup")).toHaveAttribute("data-screen", "home");

  // History (deferred from M3): the activation is the newest item, with our fee in the detail.
  const row = popup.getByTestId("activity-row").first();
  await expect(row).toContainText(`Activated ${fresh.slice(0, 4)}…${fresh.slice(-4)}`, {
    timeout: 30_000,
  });
  await expect(row.getByTestId("activity-amount")).toHaveText("\u22122 XLM");
  await row.click();
  await expect(popup.getByTestId("popup")).toHaveAttribute("data-screen", "activity-detail");
  await expect(popup.getByText("Network fee", { exact: true })).toBeVisible();
  await expect(popup.getByTestId("detail-fee")).toHaveText(/^0\.\d+ XLM$/);
});

test("payment with a text memo to an existing account", async ({ context, extensionId }) => {
  test.setTimeout(150_000);
  const popup = await fundedWallet(context, extensionId);
  const dest = Keypair.random().publicKey();
  await fund(dest);
  await fillSend(popup, dest, "1.5");
  await popup.getByRole("button", { name: "Add memo" }).click();
  await popup.getByTestId("send-memo").fill("order 1001");
  await expect(popup.getByText("10/28 bytes")).toBeVisible();
  await popup.getByRole("button", { name: "Continue" }).click();
  await expect(popup.getByTestId("review-type")).toHaveText("Send XLM", { timeout: 30_000 });
  await expect(popup.getByTestId("review-memo")).toHaveText("order 1001");
  await popup.getByRole("button", { name: "Confirm and send" }).click();
  await expect(popup.getByTestId("result")).toHaveAttribute("data-status", "success", {
    timeout: 60_000,
  });
  expect(await nativeBalance(dest)).toBe("10001.5000000");

  await popup.getByRole("button", { name: "Done" }).click();
  const row = popup.getByTestId("activity-row").first();
  await expect(row.getByTestId("activity-memo")).toHaveText("order 1001", { timeout: 30_000 });
  await expect(row.getByTestId("activity-amount")).toHaveText("\u22121.5 XLM");
});

test("SEP-29: the memo opens automatically and sending without one is blocked", async ({
  context,
  extensionId,
}) => {
  test.setTimeout(150_000);
  const popup = await fundedWallet(context, extensionId);
  const exchange = Keypair.random();
  await fund(exchange.publicKey());
  const loaded = (await horizon.getAccount(exchange.publicKey()))!;
  const tx = new TransactionBuilder(new Account(exchange.publicKey(), loaded.sequence), {
    fee: "1000",
    networkPassphrase: NETWORKS.testnet.passphrase,
  })
    .addOperation(Operation.manageData({ name: "config.memo_required", value: "1" }))
    .setTimeout(60)
    .build();
  tx.sign(exchange);
  await horizon.submitTransactionAsync(tx.toXdr());
  await expect
    .poll(
      async () => (await horizon.getAccount(exchange.publicKey()))?.data["config.memo_required"],
      { timeout: 40_000 },
    )
    .toBe("MQ==");

  await fillSend(popup, exchange.publicKey(), "1");
  await expect(popup.getByText("This recipient requires a memo.", { exact: false })).toBeVisible({
    timeout: 15_000,
  });
  await popup.getByRole("button", { name: "Continue" }).click();
  await expect(popup.getByRole("alert")).toHaveText(/requires a memo/, { timeout: 30_000 });
  await expect(popup.getByTestId("popup")).toHaveAttribute("data-screen", "send-input");
});

test("insufficient balance offers Send max", async ({ context, extensionId }) => {
  test.setTimeout(120_000);
  const popup = await fundedWallet(context, extensionId);
  await fillSend(popup, Keypair.random().publicKey(), "50000");
  await popup.getByRole("button", { name: "Continue" }).click();
  await expect(popup.getByRole("alert")).toHaveText(/don't have enough available XLM/, {
    timeout: 30_000,
  });
  await expect(popup.getByRole("button", { name: /Send max \(9,998\.99/ })).toBeVisible();
});

test("a network switch between review and confirm is refused, then Review again", async ({
  context,
  extensionId,
}) => {
  test.setTimeout(120_000);
  const popup = await fundedWallet(context, extensionId);
  await fillSend(popup, Keypair.random().publicKey(), "2");
  await popup.getByRole("button", { name: "Continue" }).click();
  await expect(popup.getByTestId("popup")).toHaveAttribute("data-screen", "send-review", {
    timeout: 30_000,
  });
  const other = await openPopup(context, extensionId);
  expect(
    await sendFrom(other, "SET_SETTINGS", { network: "mainnet", acknowledgedRealFunds: true }),
  ).toMatchObject({ ok: true });
  await popup.getByRole("button", { name: "Confirm and send" }).click();
  await expect(popup.getByRole("alert")).toHaveText(/network changed/i);
  await expect(popup.getByRole("button", { name: "Review again" })).toBeVisible();
});

test("M3 exit: killing the SW right after Confirm still ends in a definitive outcome", async ({
  context,
  extensionId,
}) => {
  test.setTimeout(180_000);
  const popup = await fundedWallet(context, extensionId);
  const fresh = Keypair.random().publicKey();
  await fillSend(popup, fresh, "3");
  await popup.getByRole("button", { name: "Continue" }).click();
  await expect(popup.getByTestId("popup")).toHaveAttribute("data-screen", "send-review", {
    timeout: 30_000,
  });

  const cdp = await context.newCDPSession(popup);
  await cdp.send("ServiceWorker.enable");
  await popup.getByRole("button", { name: "Confirm and send" }).click();
  await popup.waitForTimeout(150);
  await cdp.send("ServiceWorker.stopAllWorkers");

  // A fresh popup restarts the worker, which resumes anything in flight (ADR 0007).
  const fresh2 = await openPopup(context, extensionId);
  await expect
    .poll(
      async () => {
        const res = (await sendFrom(fresh2, "GET_STATUS")) as {
          data?: { inflight: { status: string }[] };
        };
        return res.data?.inflight.some((i) => i.status === "resolving") ?? true;
      },
      { timeout: 120_000, intervals: [3_000] },
    )
    .toBe(false);

  const status = (await sendFrom(fresh2, "GET_STATUS")) as {
    data: { inflight: { outcome: { status: string } | null }[] };
  };
  const reportedSent = status.data.inflight.some((i) => i.outcome?.status === "success");
  const funded = (await nativeBalance(fresh)) !== null;
  // Definitive and truthful: paid if and only if the wallet says so. Never a double send.
  expect(funded).toBe(reportedSent);
  if (funded) expect(await nativeBalance(fresh)).toBe("3.0000000");
});
