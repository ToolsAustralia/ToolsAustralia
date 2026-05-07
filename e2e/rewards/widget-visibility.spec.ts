// e2e/rewards/widget-visibility.spec.ts
//
// The RewardsFloatingWidget renders on /my-account once the wallet query
// resolves (it's gated by `isReady = claimableQuery.isSuccess`). The FAB
// is the only always-visible surface — the spotlight overlay only shows
// when the user has unclaimed rewards AND has not seen the spotlight yet
// (localStorage flag `rewardsWidgetSpotlightSeen_<userId>`).
//
// We assert visibility of the FAB on first paint. Spotlight visibility
// is conditional and not asserted here (no claimable issuance is seeded
// for the fresh fixture).

import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";

test.describe("rewards floating widget visibility", () => {
  test.beforeEach(async ({ page, context }) => {
    // Clear localStorage so spotlight state doesn't leak between specs.
    await context.addInitScript(() => {
      try {
        window.localStorage.clear();
      } catch {}
    });
    void page;
  });

  test("FAB renders on /my-account after wallet query resolves", async ({ page }) => {
    await page.goto("/my-account");
    await expect(page.locator(byTestId(testid.dashboardRoot))).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.locator(byTestId(testid.rewardsFloatingWidget))).toBeVisible({
      timeout: 15_000,
    });
  });
});
