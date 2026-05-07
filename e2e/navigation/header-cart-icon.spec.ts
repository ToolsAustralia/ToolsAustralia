import { test, expect } from "../fixtures/test";

// Header cart icon click→drawer interaction. Empty cart only — the existing
// e2e/shop/cart-icon-badge.spec.ts covers the badge count behavior with items.
test.describe("header cart icon", () => {
  test("clicking the cart icon opens the drawer when empty", async ({ page }) => {
    await page.goto("/");

    // Header.tsx renders the cart button with aria-label="Open cart".
    const cartButton = page.getByRole("button", { name: /open cart/i });
    await expect(cartButton).toBeVisible({ timeout: 5_000 });

    // No badge <span> inside the button when totalItems === 0.
    await expect(cartButton.locator("span")).toHaveCount(0);

    await cartButton.click();

    // Cart Sidebar header reads "Shopping Cart" (Header.tsx:1550). Empty-state
    // body or "Proceed to Checkout" CTA should also be present, but the heading
    // is the most stable anchor.
    await expect(page.getByRole("heading", { name: /shopping cart/i })).toBeVisible({ timeout: 5_000 });
  });
});
