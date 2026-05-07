// e2e/account/payment-methods.spec.ts
//
// SCOPE NARROWED: the fresh fixture user has no Stripe customer (see
// scripts/seed-e2e-fixtures.ts:97-101 — fresh skips ensureE2ECustomer),
// so the saved-payment-methods list always renders the empty state for
// this role. We assert:
//   1. Payment tab opens and the empty-state UI is shown.
//   2. The "Add Payment Method" button is visible (testid present).
//
// Add card flow itself triggers /api/stripe/create-setup-intent which
// calls Stripe to create a customer + SetupIntent — that's a heavy
// network dependency and the existing shop checkout specs already exercise
// real Stripe + the PaymentElement happy path. Add/Set-default/Delete are
// out of scope here.

import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";

test("payment methods tab shows empty state and add-button for users with no saved cards", async ({
  page,
}) => {
  await page.goto("/my-account/settings");
  await expect(page.locator(byTestId(testid.accountSettingsTabs))).toBeVisible({
    timeout: 25_000,
  });

  await page.locator(byTestId(testid.accountSettingsTabPayment)).click();

  // Either the empty-state copy appears OR a saved card item appears.
  // For fresh (no Stripe), the empty-state path is taken.
  await expect(
    page.locator(byTestId(testid.accountAddPaymentMethodButton)).first(),
  ).toBeVisible({ timeout: 15_000 });

  // No saved-card-item rows for the fresh fixture user.
  await expect(page.locator(byTestId(testid.accountSavedCardItem))).toHaveCount(0);
});
