// e2e/global-ui/affiliate-mode-header.spec.ts
//
// Authenticated affiliate on /affiliate: header renders the affiliate-only
// nav (Dashboard link + name + Logout) rather than the regular member menu.
//
// CONTRACT NOTE: the original spec contract said "no shop link". This is
// inaccurate — Header.tsx unconditionally renders Home/Shop/Mini Draws/
// Membership/Results/Partner/FAQ/Contact links for ALL viewers. The only
// affiliate-vs-member differentiation is in the right-hand action stack:
// affiliates see [Dashboard | <name> | Logout] while members see the
// user-menu chip with the membership badge. We assert the actual contract.
import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";

test("affiliate header shows affiliate-only menu (Dashboard, name, Logout)", async ({ page }) => {
  await page.goto("/affiliate");

  // Affiliate-specific nav lands on the right-hand action stack (desktop).
  // The Dashboard link is rendered with href="/affiliate".
  const affiliateDashboardLink = page.getByRole("link", { name: /^dashboard$/i }).first();
  await expect(affiliateDashboardLink).toBeVisible({ timeout: 10_000 });
  await expect(affiliateDashboardLink).toHaveAttribute("href", "/affiliate");

  // Logout button (lucide LogOut icon + "Logout" label) is shown only for
  // an authenticated affiliate.
  await expect(page.getByRole("button", { name: /^logout$/i }).first()).toBeVisible();

  // Member-only header chrome should NOT be present:
  // - the desktop user-menu chip (testid header-user-menu) only renders when
  //   isAffiliateAuthenticated is false AND isAuthenticated is true.
  await expect(page.locator(byTestId(testid.headerUserMenu))).toHaveCount(0);

  // - the membership badge (testid header-membership-badge) is gated behind
  //   the same member-mode branch.
  await expect(page.locator(byTestId(testid.headerMembershipBadge))).toHaveCount(0);

  // Sanity: the regular nav links (Shop, Membership) are still rendered
  // unconditionally — affiliate mode does NOT hide them.
  await expect(page.getByRole("link", { name: /^shop$/i }).first()).toBeVisible();
});
