// e2e/toasts/upgrade-success.spec.ts
//
// UpgradeSuccessToast (src/components/UpgradeSuccessToast.tsx) is
// rendered globally in src/app/providers.tsx. On mount it reads
// `localStorage.subscription_upgraded` (a JSON blob with timestamp);
// if the timestamp is < 15s old, it fires a 25-second toast with a
// "View Benefits" action link to /my-account.
//
// We seed the localStorage value via addInitScript before any page
// JS runs, then reload to trigger the effect's first run.
//
// The assertion is strictly toast-driven (not subscription-state driven):
// any logged-in user can show the toast — this spec runs under
// chromium-fresh because that project ships an authenticated session,
// which is required for the layout to mount UpgradeSuccessToast as part
// of the providers tree.

import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";

test("upgrade-success-toast renders when subscription_upgraded localStorage is fresh", async ({
  page,
}) => {
  // Seed the localStorage value BEFORE the page mounts so the effect's
  // useEffect on first paint sees it.
  await page.addInitScript(() => {
    localStorage.setItem(
      "subscription_upgraded",
      JSON.stringify({
        packageName: "Foreman",
        packageId: "foreman-subscription",
        timestamp: Date.now(),
        entriesPerMonth: 30,
        totalEntriesAfterUpgrade: 45,
        partnerDiscountDays: 30,
      }),
    );
  });

  await page.goto("/my-account");

  const toast = page.locator(byTestId(testid.upgradeSuccessToast));
  await expect(toast).toBeVisible({ timeout: 10_000 });

  // Verify the title content.
  await expect(toast).toContainText(/Membership Upgraded Successfully/i);

  // The action button "View Benefits" navigates to /my-account.
  // We're already on /my-account, but the action HREF assignment uses
  // window.location.href — assert the button is present and clickable.
  const viewBenefits = toast.getByRole("button", { name: /View Benefits/i });
  await expect(viewBenefits).toBeVisible();

  // Clean up: the component already removes the localStorage flag, but
  // belt-and-braces guard for subsequent tests in the worker.
  await page.evaluate(() => localStorage.removeItem("subscription_upgraded"));
});
