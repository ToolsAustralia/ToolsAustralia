// e2e/affiliate/link-generation.spec.ts
//
// Click the dashboard's "Copy Link" button and assert the affiliate link
// (with embedded ref code) lands on the clipboard. The dashboard surfaces
// only one copy control — the link itself — and the link includes the
// affiliate code as a query param, so this also covers code propagation.

import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";

test("copy link button writes the affiliate link (with ref code) to the clipboard", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  await page.goto("/affiliate");

  const linkInput = page.locator(byTestId(testid.affiliateDashboardLink));
  await expect(linkInput).toBeVisible({ timeout: 15_000 });
  const expectedLink = await linkInput.inputValue();
  expect(expectedLink).toMatch(/ref=AFFE2EW\d+/);

  const copyBtn = page.locator(byTestId(testid.affiliateDashboardCopyLink));
  await expect(copyBtn).toBeVisible({ timeout: 5_000 });
  await copyBtn.click();

  // Button flips to "Copied!" after the clipboard write resolves — wait on
  // that visible state before reading clipboard contents to avoid the race.
  await expect(copyBtn.getByText(/copied!/i)).toBeVisible({ timeout: 5_000 });

  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toBe(expectedLink);
});
