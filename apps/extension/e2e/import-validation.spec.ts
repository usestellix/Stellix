import { SEP0005_VECTORS } from "../../../packages/core/src/keys/__tests__/sep0005.vectors.js";
import { expect, test } from "./fixtures.js";
import { openOnboarding } from "./helpers.js";

// Regression: a blur-time error message used to shift the Continue button mid-click, so the
// click missed and the form never submitted.

const TEST1 = SEP0005_VECTORS.find((v) => v.test === 1)!;

test("an unknown word is flagged on the first Continue click", async ({ context, extensionId }) => {
  const p = await openOnboarding(context, extensionId);
  await p.getByRole("button", { name: "I already have a recovery phrase" }).click();
  const words = TEST1.mnemonic.split(" ");
  for (let i = 0; i < 12; i++) {
    await p.getByTestId(`import-word-${String(i + 1)}`).fill(i === 4 ? `${words[i]!}x` : words[i]!);
  }
  await p.getByRole("button", { name: "Continue" }).click();
  await expect(p.getByRole("alert")).toHaveText(/aren't in the recovery phrase word list/);
  await expect(p.getByTestId("import-word-5")).toHaveAttribute("aria-invalid", "true");
  await expect(p.getByTestId("import-word-5")).toBeFocused();
  await expect(p.locator('[aria-invalid="true"]')).toHaveCount(1);
});

test("empty boxes get their own message", async ({ context, extensionId }) => {
  const p = await openOnboarding(context, extensionId);
  await p.getByRole("button", { name: "I already have a recovery phrase" }).click();
  await p.getByTestId("import-word-1").fill("abandon");
  await p.getByRole("button", { name: "Continue" }).click();
  await expect(p.getByRole("alert")).toHaveText("Enter all 12 words.");
});

test("valid words in the wrong order show the checksum message", async ({
  context,
  extensionId,
}) => {
  const p = await openOnboarding(context, extensionId);
  await p.getByRole("button", { name: "I already have a recovery phrase" }).click();
  const words = TEST1.mnemonic.split(" ");
  [words[0], words[1]] = [words[1]!, words[0]!];
  for (let i = 0; i < 12; i++) await p.getByTestId(`import-word-${String(i + 1)}`).fill(words[i]!);
  await p.getByRole("button", { name: "Continue" }).click();
  await expect(p.getByRole("alert")).toHaveText(/isn't valid/);
});
