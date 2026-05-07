// e2e/global-ui/membership-badge.spec.ts
//
// Tradie member: header desktop user menu shows the MembershipBadge button.
// Clicking it opens the PackageDetailModal.
import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";

// Serial: shares the tradie-w<N> fixture user with mutating membership specs.
test.describe.configure({ mode: "serial" });

test("clicking the header membership badge opens the package detail modal", async ({ page }) => {
  await page.goto("/");

  // Allow the header to hydrate and the user/subscription to load. The badge
  // is gated behind `userData?.subscription?.isActive`, which the fixture
  // user has true.
  const badge = page.locator(byTestId(testid.headerMembershipBadge)).first();
  await expect(badge).toBeVisible({ timeout: 10_000 });

  await badge.click();

  await expect(page.locator(byTestId(testid.packageDetailModal))).toBeVisible({
    timeout: 5_000,
  });
});
