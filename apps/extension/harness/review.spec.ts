import { expect, test, type Page } from "@playwright/test";

// Send Review with Shield findings (#36), driven in a real browser. Review's decision only
// gates the button; the SW re-checks the confirmation against its own report (invariant 15,
// covered by payments.test.ts and send-shield.test.ts).

async function open(page: Page, query: string) {
  await page.setViewportSize({ width: 360, height: 600 });
  await page.goto(`/?${query}`);
  await expect(page.getByTestId("popup")).toHaveAttribute("data-screen", "send-review");
}

const confirm = (page: Page) => page.getByRole("button", { name: "Confirm and send" });
const sent = (page: Page) => page.getByTestId("sent-confirmation");

test("typed review: the decision's phrase, and only it, enables Confirm", async ({ page }) => {
  await open(page, "decision=typed&phrase=SEND%20ANYWAY");
  await expect(page.locator('[data-rule="UNNAMED_OUTFLOW"]')).toBeVisible();
  await expect(page.getByTestId("typed-phrase")).toHaveText("SEND ANYWAY");
  await expect(confirm(page)).toBeDisabled();

  const input = page.getByTestId("typed-confirmation-input");
  for (const wrong of ["CONFIRM", "send anyway", "SEND ANYWAY "]) {
    await input.fill(wrong);
    await expect(confirm(page)).toBeDisabled();
  }
  await input.fill("SEND ANYWAY");
  await expect(confirm(page)).toBeEnabled();
  await confirm(page).click();
  await expect(sent(page)).toHaveText(JSON.stringify({ kind: "typed", phrase: "SEND ANYWAY" }));
});

test("blocked: Confirm is disabled and there is nothing to type", async ({ page }) => {
  await open(page, "decision=blocked");
  await expect(page.locator('[data-rule="ACCT_SIGNER_CHANGE"]')).toBeVisible();
  await expect(page.getByText("Stellix won't sign this.", { exact: false })).toBeVisible();
  await expect(page.getByTestId("typed-confirmation")).toHaveCount(0);
  await expect(confirm(page)).toBeDisabled();
  await confirm(page).click({ force: true });
  await expect(sent(page)).toHaveText("");
});

test("click review: the finding is shown and Confirm sends a click", async ({ page }) => {
  await open(page, "decision=click");
  await expect(page.locator('[data-rule="HIGH_FEE"]')).toBeVisible();
  await confirm(page).click();
  await expect(sent(page)).toHaveText(JSON.stringify({ kind: "click" }));
});

// Screenshots for the PR (light and dark), written next to the build output.
for (const colorScheme of ["light", "dark"] as const) {
  for (const decision of ["ready", "typed", "blocked"] as const) {
    test(`screenshot ${decision} ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await open(page, `decision=${decision}`);
      await page.getByTestId("review-shield").scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `.output-harness/png/review-${decision}-${colorScheme}.png`,
        fullPage: true,
      });
    });
  }
}
