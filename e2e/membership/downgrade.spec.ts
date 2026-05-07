// e2e/membership/downgrade.spec.ts
//
// Foreman -> Tradie downgrade. The downgrade flow does NOT trigger the
// CancellationUpsellModal (that is only for full cancellation). Clicking
// "Schedule Downgrade" opens the ConfirmationModal; confirming POSTs to
// /api/stripe/downgrade-subscription which sets subscription.pendingChange.
//
// Narrowed assertion: confirm Confirmation modal opens. Driving the API
// confirm + DB pendingChange is verified via waitForApi.

import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";
import { resetUser } from "../fixtures/seed-helpers";

test.describe.configure({ mode: "serial" });

test.describe("membership downgrade", () => {
  test.beforeEach(async () => {
    await resetUser("foreman", test.info().parallelIndex);
  });

  test("clicking downgrade opens confirmation modal", async ({ page }) => {
    await page.goto("/my-account/settings?tab=subscription");

    const downgradeBtn = page.locator(byTestId(testid.subscriptionDowngradeTradie));
    await expect(downgradeBtn).toBeVisible({ timeout: 25_000 });

    await downgradeBtn.click();

    await expect(page.locator(byTestId(testid.confirmationModal))).toBeVisible({
      timeout: 5_000,
    });
    await expect(
      page.getByRole("heading", { name: /downgrade to tradie/i }),
    ).toBeVisible({ timeout: 5_000 });
  });
});
