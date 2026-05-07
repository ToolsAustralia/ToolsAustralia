// e2e/membership/upgrade.spec.ts
//
// Tradie -> Foreman upgrade. Authenticated as the tradie fixture, the
// /my-account/settings?tab=subscription page (rendered via SubscriptionTab
// embedding SubscriptionManagementModal as a panel) shows an "Upgrade Now"
// button per available upgrade. Clicking it opens ConfirmationModal.
//
// Narrowed: full Stripe payment is NOT driven here — clicking Confirm in
// the upgrade ConfirmationModal launches StripePaymentModal which requires
// PaymentElement interaction. The plan permits narrowing to "modal opens".

import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";
import { resetUser } from "../fixtures/seed-helpers";

test.describe.configure({ mode: "serial" });

test.describe("membership upgrade", () => {
  test.beforeEach(async () => {
    await resetUser("tradie", test.info().parallelIndex);
  });

  test("clicking upgrade opens confirmation modal targeting the new package", async ({
    page,
  }) => {
    await page.goto("/my-account/settings?tab=subscription");

    // The subscription panel hits /api/subscription/benefits to populate
    // available upgrades. Wait for the foreman upgrade button.
    const upgradeBtn = page.locator(byTestId(testid.subscriptionUpgradeForeman));
    await expect(upgradeBtn).toBeVisible({ timeout: 25_000 });

    await upgradeBtn.click();

    // ConfirmationModal opens (nestedSecondary). Title: "Upgrade to Foreman".
    await expect(page.locator(byTestId(testid.confirmationModal))).toBeVisible({
      timeout: 5_000,
    });
    await expect(
      page.getByRole("heading", { name: /upgrade to foreman/i }),
    ).toBeVisible({ timeout: 5_000 });
  });
});
