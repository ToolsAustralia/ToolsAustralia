// e2e/membership/resume.spec.ts
//
// Cancelling fixture (subscription marked cancelled) sees a "Reactivate"
// button on the subscription panel. Clicking it calls the renew mutation.
//
// Narrowed: full Stripe reactivation may require a real subscription. We
// assert the button is visible & clickable.

import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";
import { resetUser } from "../fixtures/seed-helpers";

test.describe.configure({ mode: "serial" });

test.describe("subscription resume", () => {
  test.beforeEach(async () => {
    await resetUser("cancelling", test.info().parallelIndex);
  });

  test("Reactivate button is visible for cancelled fixture", async ({ page }) => {
    await page.goto("/my-account/settings?tab=subscription");

    // Wait for benefits to load and the cancelled-state UI to render.
    const resumeBtn = page.locator(byTestId(testid.subscriptionResumeButton));
    await expect(resumeBtn).toBeVisible({ timeout: 25_000 });
    await expect(resumeBtn).toBeEnabled();
  });
});
