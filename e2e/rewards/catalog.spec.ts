// e2e/rewards/catalog.spec.ts
//
// Clicking the FAB opens the side drawer with the wallet catalog. We assert:
//   1. The drawer renders with the Claimable header.
//   2. Both tabs (Claimable / Past Rewards) are visible.
//   3. Switching tabs swaps the visible content (we look for the
//      "No rewards yet" empty state since the fresh fixture has no items).
//
// Pagination is only rendered when totalPages > 1, which never happens for
// an empty wallet — so we don't exercise it here.

import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";
import { getDb } from "../fixtures/seed-helpers";
import { emailFor } from "../fixtures/test-users";

test.describe("rewards catalog", () => {
  test.beforeEach(async () => {
    // Klaviyo blocking is centralised in e2e/fixtures/test.ts.
    // The /my-account page auto-opens UserSetupModal when birthdate is
    // missing on the fresh fixture (see src/app/(site)/my-account/page.tsx
    // line 209). Backfill the missing profile fields so that modal stays shut
    // and the FAB is clickable.
    const { User } = await getDb();
    await User.updateOne(
      { email: emailFor("fresh", test.info().parallelIndex) },
      {
        $set: {
          birthdate: new Date("1990-01-01"),
          state: "NSW",
          profession: "Carpenter",
          profileSetupCompleted: true,
        },
      },
    );
  });

  test.afterEach(async () => {
    // Restore the fresh fixture to its seeded baseline (birthdate/state/profession
    // unset; profileSetupCompleted is back to true since the seed sets it true).
    const { User } = await getDb();
    await User.updateOne(
      { email: emailFor("fresh", test.info().parallelIndex) },
      {
        $unset: { birthdate: "", state: "", profession: "" },
        $set: { profileSetupCompleted: true },
      },
    );
  });

  test("FAB opens the catalog drawer and tabs work", async ({ page }) => {
    await page.goto("/my-account");
    await expect(page.locator(byTestId(testid.dashboardRoot))).toBeVisible({
      timeout: 25_000,
    });

    const fab = page.locator(byTestId(testid.rewardsFloatingWidget));
    await expect(fab).toBeVisible({ timeout: 15_000 });
    // Strip the Next.js dev overlay (<nextjs-portal>) and the dev-only
    // MajorDrawTestControls (bottom-left FAB at z-[9998]) which both intercept
    // pointer events on top of the rewards FAB. Klaviyo is blocked at the
    // network level above.
    await page.evaluate(() => {
      document.querySelectorAll("nextjs-portal").forEach((el) => el.remove());
      document
        .querySelectorAll('button[title="Major Draw Test Controls"]')
        .forEach((el) => el.closest("div.fixed")?.remove());
    });
    await fab.click();

    // Header copy lives inside the drawer.
    await expect(
      page.getByRole("heading", { name: /claimable rewards/i }),
    ).toBeVisible({ timeout: 5_000 });

    // Both tab buttons render.
    const claimableTab = page.locator(byTestId(testid.rewardsTabClaimable));
    const pastTab = page.locator(byTestId(testid.rewardsTabPast));
    await expect(claimableTab).toBeVisible();
    await expect(pastTab).toBeVisible();

    // Switching to past tab swaps copy.
    await pastTab.click();
    await expect(
      page.getByText(/your claimed rewards will be shown here/i),
    ).toBeVisible({ timeout: 5_000 });

    // Switching back surfaces the claimable empty-state copy.
    await claimableTab.click();
    await expect(
      page.getByText(/when new campaigns are available/i),
    ).toBeVisible({ timeout: 5_000 });
  });
});
