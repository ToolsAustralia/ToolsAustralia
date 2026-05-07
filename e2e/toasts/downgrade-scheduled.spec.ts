// e2e/toasts/downgrade-scheduled.spec.ts
//
// Companion to upgrade-success.spec.ts. UpgradeSuccessToast also handles
// `localStorage.subscription_downgraded`: a JSON blob with currentPackageName,
// newPackageName, daysUntilChange, effectiveDate, timestamp. When the
// timestamp is < 15s old, fires a 15-second "Downgrade Scheduled
// Successfully!" toast tagged with `data-testid="downgrade-scheduled-toast"`.
//
// Like the upgrade variant, this is purely localStorage-driven — no
// actual subscription change is required. Runs under chromium-fresh
// because providers.tsx is the mount point and providers requires
// an authenticated session for the dashboard layout.

import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";

test("downgrade-scheduled-toast renders when subscription_downgraded localStorage is fresh", async ({
  page,
}) => {
  const effectiveDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString();

  await page.addInitScript((effective) => {
    localStorage.setItem(
      "subscription_downgraded",
      JSON.stringify({
        currentPackageName: "Boss",
        newPackageName: "Foreman",
        daysUntilChange: 15,
        effectiveDate: effective,
        timestamp: Date.now(),
      }),
    );
  }, effectiveDate);

  await page.goto("/my-account");

  const toast = page.locator(byTestId(testid.downgradeScheduledToast));
  await expect(toast).toBeVisible({ timeout: 10_000 });
  await expect(toast).toContainText(/Downgrade Scheduled Successfully/i);
  await expect(toast).toContainText(/Boss/);
  await expect(toast).toContainText(/Foreman/);

  // Belt-and-braces: clear leftover key.
  await page.evaluate(() => localStorage.removeItem("subscription_downgraded"));
});
