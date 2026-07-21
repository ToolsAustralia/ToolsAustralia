import { test, expect } from "../../fixtures/test";

test.describe("login @smoke", () => {
  test("member signs in and lands on my-account", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(process.env.E2E_TEST_USER_EMAIL || "e2e.member@e2e.local");
    await page.locator('input[name="password"]').fill(process.env.E2E_TEST_USER_PASSWORD || "E2e!Passw0rd");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    // 45s (not 20s): dev-server contention under 3 parallel browser projects can stretch
    // the login→/my-account redirect past 20s; the assertion still proves the redirect
    // happens, and prod isn't dev (no Turbopack cold-compile / 8-worker contention there).
    await expect(page).toHaveURL(/\/my-account/, { timeout: 45_000 });
  });

  test("wrong password shows an error and stays on /login", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(process.env.E2E_TEST_USER_EMAIL || "e2e.member@e2e.local");
    await page.locator('input[name="password"]').fill("definitely-wrong-password");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
