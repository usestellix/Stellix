import { expect, test } from "@playwright/test";

// One PNG per severity, light and dark (#34 acceptance criteria).
const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;

for (const colorScheme of ["light", "dark"] as const) {
  for (const severity of SEVERITIES) {
    test(`findings ${severity} ${colorScheme}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme });
      await page.setViewportSize({ width: 360, height: 600 });
      await page.goto(`/?severity=${severity}`);
      const harness = page.getByTestId("harness");
      await expect(harness).toBeVisible();
      // Open the evidence of the first finding so the evidence view is in the shot.
      await page.locator("details summary").first().click();
      await harness.screenshot({
        path: `.output-screenshots/png/findings-${severity}-${colorScheme}.png`,
      });
    });
  }
}
