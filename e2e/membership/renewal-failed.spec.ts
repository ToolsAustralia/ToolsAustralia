// e2e/membership/renewal-failed.spec.ts
//
// pastdue fixture has subscription.status="past_due", isActive=false,
// autoRenew=true → hasFailedRenewal()=true. UnifiedModalManager auto-opens
// RenewalFailedModal when on /my-account routes.

import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";
import { resetUser } from "../fixtures/seed-helpers";

// Serial: shares pastdue-w<N> with update-payment-method.spec.ts.
test.describe.configure({ mode: "serial" });

test.describe("renewal failed modal", () => {
  // The Stripe sub created at seed time fires `invoice.paid` shortly after,
  // which webhooks-back into the User and flips status: "active". resetUser
  // here re-asserts the past_due variant on every test so the trigger
  // condition (hasFailedRenewal) holds true.
  test.beforeEach(async () => {
    await resetUser("pastdue", test.info().parallelIndex);
  });

  test("auto-opens on /my-account for past-due fixture", async ({ page }) => {
    await page.goto("/my-account");

    // Dashboard should still load (RenewalFailedModal is auto-requested via
    // UnifiedModalManager once user data resolves).
    await expect(page.locator(byTestId(testid.dashboardRoot))).toBeVisible({
      timeout: 25_000,
    });

    // The modal opens automatically.
    await expect(page.locator(byTestId(testid.renewalFailedModal))).toBeVisible({
      timeout: 15_000,
    });

    // The modal title or "Resolve Payment Issue" CTA should be visible.
    await expect(
      page.getByRole("button", { name: /resolve payment issue/i }),
    ).toBeVisible({ timeout: 5_000 });
  });
});
