// e2e/membership/benefits.spec.ts
//
// /my-account/benefits page renders Partner Discounts hero + grid for any
// authenticated user. Fresh fixture (no membership) sees the "Become a
// Member to Unlock" copy.

import { test, expect } from "../fixtures/test";

test.describe("benefits page", () => {
  test("renders for fresh user", async ({ page }) => {
    await page.goto("/my-account/benefits");

    // Hero heading is unique to this page.
    await expect(
      page.getByRole("heading", {
        name: /Everything you need to manage partner discounts/i,
      }),
    ).toBeVisible({ timeout: 25_000 });

    // For fresh user (no access), the grid shows the "Become a Member to Unlock" title.
    await expect(
      page.getByRole("heading", { name: /become a member to unlock/i }),
    ).toBeVisible({ timeout: 10_000 });
  });
});
