import { test, expect } from "../../fixtures/test";
import { ADMIN_STATE, MEMBER_STATE } from "../../lib/paths";

test.describe("admin gate @smoke @admin", () => {
  test.use({ storageState: ADMIN_STATE });

  test("admin reaches /admin", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin/, { timeout: 20_000 });
    // DEVIATION from the brief's `main, [role=main]` locator (documented — evidence in
    // task-8-report.md): src/app/admin/layout.tsx has no <main> or role="main" element.
    // Verified via error-context.md DOM snapshot on a real failure: the admin content
    // area's actual root signal is the tab heading rendered by AdminPage.tsx:159
    // (`<h1 className="... capitalize">{selectedTab.replace("-", " ")}</h1>`), which for
    // the default /admin route is "overview" (src/app/admin/page.tsx:83). A plain
    // level-1 heading locator is ambiguous — the sidebar's static "Admin Panel" <h1>
    // (AdminSidebar.tsx) is also on the page, and a loose /overview/i name match also
    // catches an unrelated "Revenue overview" <h3> further down the dashboard — so
    // scope to the exact tab heading text.
    await expect(page.getByRole("heading", { name: "overview", exact: true })).toBeVisible({ timeout: 20_000 });
  });
});

// Separate describe block (not a manual browser.newContext()) so this test still gets
// full fixture coverage — QA watchdog, per-worker x-forwarded-for, third-party
// blocklist — from e2e/fixtures/test.ts, same rationale as the admin block above.
test.describe("admin gate — member blocked @smoke @admin", () => {
  test.use({ storageState: MEMBER_STATE });

  test("regular member is bounced from /admin to /", async ({ page }) => {
    await page.goto("/admin");
    // middleware.ts:95-105 → non-internal userType redirected to "/"
    await expect(page).not.toHaveURL(/\/admin/, { timeout: 20_000 });
  });
});
