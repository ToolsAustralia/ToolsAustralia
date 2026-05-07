import { test, expect } from "../fixtures/test";

// Pure UI test for /my-account/orders + /my-account/orders/[orderNumber].
// Doesn't require a real checkout — instead asserts that:
//  - the orders list page renders
//  - empty-state copy shows when no orders exist
//  - 404 / not-found copy shows when navigating to a non-existent order
//
// The end-to-end "place order → see it appear" path is covered by
// member-checkout.spec.ts (which already extends to the orders page).
//
// This spec runs in the chromium-member project so it has a NextAuth session.

test("orders list page renders for a logged-in user", async ({ page }) => {
  await page.goto("/my-account/orders");

  await expect(page.getByRole("heading", { name: /my orders/i })).toBeVisible();

  // Either we see "No orders yet" copy OR at least one order item — both are valid
  // (the test account may already have history).
  const empty = page.locator("text=/no orders yet/i");
  const firstItem = page.locator("li").first();
  await expect(empty.or(firstItem)).toBeVisible({ timeout: 10_000 });
});

test("non-existent order detail page shows not-found copy", async ({ page }) => {
  await page.goto("/my-account/orders/SHOP-DOES-NOT-EXIST");

  // useOrderQuery returns { error } via the API's 404, the page renders "Order not found."
  await expect(page.locator("text=/order not found/i")).toBeVisible({ timeout: 10_000 });
});
