// e2e/banners-widgets/floating-promo-page-aware.spec.ts
//
// FloatingPromoBanner is hidden on the following routes (per the
// pathname guards in src/components/banners/FloatingPromoBanner.tsx):
//   - /shop/**           (isShopPage)
//   - /admin/**          (isAdminPage; not visited as a guest anyway)
//   - /affiliate/**      (isAffiliatePage)
//   - /login             (isLoginPage)
//   - /terms             (isTermsPage)
//   - /privacy           (isPrivacyPage)
//   - /competition-term-majordraw
//   - /promotions/**     (isPromotionsPage)
//   - /my-account/**     (isMyAccountPage)
//   - /not-found
//
// We loop the user-relevant subset and assert the banner testid is absent.
// NOTE: the banner is ALSO suppressed when no active promo multiplier is
// resolved (`activeMultiplier <= 1`), so banner-absent on a permitted
// route is not a contradiction. We only assert the page-guard branch.

import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";

const HIDDEN_ROUTES = [
  "/shop",
  "/affiliate",
  "/login",
  "/terms",
  "/privacy",
];

for (const route of HIDDEN_ROUTES) {
  test(`floating-promo-banner is absent on ${route}`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState("domcontentloaded").catch(() => {});

    const banner = page.locator(byTestId(testid.floatingPromoBanner));

    // Give the banner a brief window to mount IF it were going to.
    await page.waitForTimeout(1000);

    await expect(banner).toHaveCount(0);
  });
}
