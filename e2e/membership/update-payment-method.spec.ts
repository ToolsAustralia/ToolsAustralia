// e2e/membership/update-payment-method.spec.ts
//
// Past-due fixture: settings -> subscription panel renders the failed
// renewal alert with "Resolve Payment Issue" button. Clicking it opens
// the RenewalFailedModal where a Pay Now flow exists.
//
// Narrowed to "modal opens" — the actual Pay Now flow requires a real
// failed Stripe invoice for this user, which the fixture does not seed.

import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";
import { resetUser } from "../fixtures/seed-helpers";

// Serial: shares pastdue-w<N> with renewal-failed.spec.ts.
test.describe.configure({ mode: "serial" });

test.describe("update payment method (past-due flow)", () => {
  // The Stripe sub fires invoice.paid shortly after seeding which reverts
  // the past_due variant. Re-apply on every test.
  test.beforeEach(async () => {
    await resetUser("pastdue", test.info().parallelIndex);
  });

  test("Resolve Payment Issue button opens RenewalFailedModal in settings", async ({
    page,
  }) => {
    // Navigate directly to /my-account/settings — the dashboard auto-opens
    // RenewalFailedModal so we'd race against it. Settings page does NOT
    // auto-open it; it shows the in-panel "Resolve Payment Issue" button.
    await page.goto("/my-account/settings?tab=subscription");

    // The subscription panel renders the failed renewal alert with a
    // "Resolve Payment Issue" button (testid: subscription-resolve-payment-button).
    const resolveBtn = page.locator(
      byTestId(testid.subscriptionResolvePaymentButton),
    );
    await expect(resolveBtn).toBeVisible({ timeout: 25_000 });

    // Klaviyo's popup form may intercept pointer events on first paint;
    // force-click bypasses pointer interception.
    await resolveBtn.click({ force: true });

    // RenewalFailedModal opens (in-component state, not via UnifiedModalManager).
    // Two RenewalFailedModal instances are mounted in the tree (one inside
    // SubscriptionManagementModal and one in UnifiedModalManager). Both share
    // the same testId; only one is open at a time, but both DOM elements
    // exist. .first() picks the visible one; toBeVisible asserts it.
    await expect(
      page.locator(byTestId(testid.renewalFailedModal)).first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
