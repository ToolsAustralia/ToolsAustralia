import { test, expect } from "../../fixtures/test";
import { MEMBER_STATE } from "../../lib/paths";

test.describe("my-account @smoke @demo", () => {
  test.use({ storageState: MEMBER_STATE });

  test("dashboard loads for the seeded active member", async ({ page, demo }) => {
    await demo.step("Opening the member dashboard", async () => {
      await page.goto("/my-account");
      await expect(page).toHaveURL(/\/my-account/); // not bounced to /login
    });
    await demo.step("The member's account and free entries are visible", async () => {
      await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
      // Seeded member firstName is displayed somewhere on the dashboard
      await expect(page.locator("body")).toContainText(/e2e/i, { timeout: 20_000 });
    });
  });
});

// Separate describe block (not a manual browser.newContext()) so this test still gets
// full fixture coverage — QA watchdog, per-worker x-forwarded-for, third-party
// blocklist — from e2e/fixtures/test.ts. An empty storageState object is the
// Playwright-supported way to opt a describe block out of the file's auth state.
test.describe("my-account guest gate @smoke @demo", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("guest hitting /my-account is redirected to /login", async ({ page }) => {
    await page.goto("/my-account");
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  });
});
