// e2e/affiliate/dashboard.spec.ts
//
// Authenticated affiliate lands on /affiliate and sees the dashboard
// (welcome name, affiliate link with embedded code, signups stat,
// commissions section). Uses chromium-affiliate's per-worker storageState.

import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";

test("affiliate dashboard renders link, code, and stats sections", async ({ page }) => {
  await page.goto("/affiliate");

  // Welcome heading uses the seeded affiliate's first name "Affiliate".
  await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible({
    timeout: 15_000,
  });

  // Affiliate link input is present and contains the seeded code (AFFE2EW<n>).
  const linkInput = page.locator(byTestId(testid.affiliateDashboardLink));
  await expect(linkInput).toBeVisible({ timeout: 10_000 });
  const linkValue = await linkInput.inputValue();
  expect(linkValue).toMatch(/ref=AFFE2EW\d+/);

  // Stats panel: signups card and commissions section both render.
  await expect(page.locator(byTestId(testid.affiliateDashboardSignups))).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.locator(byTestId(testid.affiliateDashboardCommissions))).toBeVisible({
    timeout: 5_000,
  });
});
