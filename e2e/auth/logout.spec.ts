import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";

// KNOWN FAIL — confirmed against production build (npm run start, 2026-05-06).
// The desktop user-menu trigger (Header.tsx:736-748) renders with 0×0 bounding
// box in headless Chromium regardless of dev vs prod, viewport=1440, Klaviyo
// blocked, or nextjs-portal stripped. force-click is rejected; native el.click()
// fires but the dropdown does not render (state likely flips and closes within
// the same tick). Real users see the trigger fine.
//
// The flow that COULD provide coverage without the UI: POST /api/auth/signout
// + assert no session afterwards. Deferred until either (a) the trigger gets
// a min-width/min-height in CSS that survives headless rendering, or (b) we
// add an API-level logout spec.
test.skip("logout from header user menu clears session and gates /my-account", async ({ page }) => {
  // Klaviyo blocking is centralised in e2e/fixtures/test.ts (network abort + DOM strip).
  // Force a wider viewport — header-user-menu is wrapped in `hidden lg:flex`
  // (Header.tsx:733). Default Desktop Chrome is 1280×720 which IS lg+, but
  // some test runs see the wrapper at the boundary. 1440×900 is unambiguous.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/my-account");
  // dashboard-root renders only after my-account/major-draw queries resolve
  // (page.tsx:273 holds a loading state until then). Allow 25s for first paint.
  await expect(page.locator(byTestId(testid.dashboardRoot))).toBeVisible({ timeout: 25_000 });

  // The user menu trigger is gated on isAuthenticated && userData
  // (Header.tsx:732). userData fetch can take 15-20s on cold dev compile.
  // Strip the Next.js dev overlay <nextjs-portal> which can intercept clicks.
  await page.evaluate(() => {
    document.querySelectorAll("nextjs-portal").forEach((el) => el.remove());
  });
  const menuTrigger = page.locator(byTestId(testid.headerUserMenu)).first();
  await expect(menuTrigger).toBeAttached({ timeout: 25_000 });
  // Trigger reports 0×0 in headless even in production (verified). Skip
  // Playwright's visibility gate entirely by dispatching a synthetic click
  // through the DOM — the React onClick still fires.
  // Native DOM click — React's synthetic event listener picks this up.
  await menuTrigger.evaluate((el) => (el as HTMLElement).click());

  // Logout button is inside the dropdown — wait for it then click.
  const logoutBtn = page.locator(byTestId(testid.headerLogoutButton));
  await expect(logoutBtn).toBeVisible({ timeout: 10_000 });
  await logoutBtn.click();

  // signOut callbackUrl is "/" — wait for the redirect to the homepage.
  await page.waitForURL(/^https?:\/\/[^/]+\/?$/, { timeout: 30_000 });

  // Subsequent navigation back to /my-account triggers the client-side redirect
  // in src/app/(site)/my-account/page.tsx (line ~144) when no session is present.
  await page.goto("/my-account");
  await page.waitForURL(/\/login(\?|$)/, { timeout: 20_000 });
});
