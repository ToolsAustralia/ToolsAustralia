// e2e/account/settings-tabs.spec.ts
//
// Tab navigation on /my-account/settings.
//
// IMPORTANT: clicking a tab does NOT update the URL — the page uses local
// component state (useState<SettingsSection | null>) instead of routing.
// However, the page DOES read `?tab=...` on first mount and selects the
// matching section (settings/page.tsx:62-67), so deep-linking via query
// param works even though clicks don't push the param.
//
// Spec asserts:
//   1. Each tab button is visible on first paint.
//   2. Clicking a tab swaps the rendered section content.
//   3. Deep-link `/my-account/settings?tab=password` opens directly to
//      the Password tab.

import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";

test.describe("settings tabs", () => {
  test("clicking each tab swaps the section content", async ({ page }) => {
    await page.goto("/my-account/settings");
    await expect(page.locator(byTestId(testid.accountSettingsTabs))).toBeVisible({
      timeout: 25_000,
    });

    // All four tabs are visible on the landing list.
    await expect(page.locator(byTestId(testid.accountSettingsTabProfile))).toBeVisible();
    await expect(page.locator(byTestId(testid.accountSettingsTabSubscription))).toBeVisible();
    await expect(page.locator(byTestId(testid.accountSettingsTabPassword))).toBeVisible();
    await expect(page.locator(byTestId(testid.accountSettingsTabPayment))).toBeVisible();

    // Profile tab — phone input is unique to ProfileTab.
    await page.locator(byTestId(testid.accountSettingsTabProfile)).click();
    await expect(page.locator(byTestId(testid.accountUpdatePhone))).toBeVisible({
      timeout: 5_000,
    });

    // Back to landing list, then Password tab — current-password input is unique.
    await page.getByRole("button", { name: /back/i }).first().click();
    await expect(page.locator(byTestId(testid.accountSettingsTabs))).toBeVisible({
      timeout: 5_000,
    });
    await page.locator(byTestId(testid.accountSettingsTabPassword)).click();
    await expect(
      page.locator(byTestId(testid.accountChangePasswordCurrent)),
    ).toBeVisible({ timeout: 5_000 });

    // Back, then Payment.
    await page.getByRole("button", { name: /back/i }).first().click();
    await page.locator(byTestId(testid.accountSettingsTabPayment)).click();
    await expect(
      page.locator(byTestId(testid.accountAddPaymentMethodButton)).first(),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("deep-link ?tab=password opens the password tab directly", async ({ page }) => {
    await page.goto("/my-account/settings?tab=password");

    // The password section renders without needing a click — current-password
    // input is unique to PasswordTab.
    await expect(
      page.locator(byTestId(testid.accountChangePasswordCurrent)),
    ).toBeVisible({ timeout: 25_000 });
  });
});
