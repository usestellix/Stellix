import { expect, test } from "./fixtures.js";
import { createWalletViaUi, openPopup, sendFrom } from "./helpers.js";

// ADR 0008: the default build is testnet-only. The mainnet switch isn't rendered, and the SW
// refuses mainnet even with the acknowledgement a mainnet-enabled UI would send. Excluded from
// the @mainnet run, which tests a mainnet-enabled build instead.

test(
  "testnet-only build: no network switch, About says so, the SW refuses mainnet",
  { tag: "@testnet-only" },
  async ({ context, extensionId }) => {
    await createWalletViaUi(context, extensionId);
    const popup = await openPopup(context, extensionId);
    await popup.getByRole("button", { name: "Settings" }).click();
    await expect(popup.getByTestId("popup")).toHaveAttribute("data-screen", "settings");
    await expect(popup.getByRole("button", { name: /^Network/ })).toHaveCount(0);
    await expect(popup.getByRole("button", { name: /Custom Horizon URL/ })).toBeVisible();

    await popup.getByRole("button", { name: /^About/ }).click();
    await expect(popup.getByTestId("about-networks")).toHaveText("Testnet only");

    expect(
      await sendFrom(popup, "SET_SETTINGS", { network: "mainnet", acknowledgedRealFunds: true }),
    ).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
    expect(
      await sendFrom(popup, "SET_SETTINGS", {
        horizonOverride: { network: "mainnet", url: "https://horizon.stellar.org" },
      }),
    ).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
    await expect(popup.getByTestId("network-badge")).toHaveText(/^testnet$/i);
  },
);
