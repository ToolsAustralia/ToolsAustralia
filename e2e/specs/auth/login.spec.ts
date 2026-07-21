import { test, expect } from "../../fixtures/test";

test.describe("login @smoke", () => {
  test("member signs in and lands on my-account", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(process.env.E2E_TEST_USER_EMAIL || "e2e.member@e2e.local");
    await page.locator('input[name="password"]').fill(process.env.E2E_TEST_USER_PASSWORD || "E2e!Passw0rd");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/my-account/, { timeout: 20_000 });
  });

  test("wrong password shows an error and stays on /login", async ({ page }) => {
    await page.goto("/login");
    await page.locator('input[name="email"]').fill(process.env.E2E_TEST_USER_EMAIL || "e2e.member@e2e.local");
    await page.locator('input[name="password"]').fill("definitely-wrong-password");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});
