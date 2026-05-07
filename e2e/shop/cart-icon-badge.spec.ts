import { test, expect } from "../fixtures/test";
import { ensureE2EProducts, teardownE2EProducts } from "../fixtures/test-products";

let productId: string;

test.beforeAll(async () => {
  productId = (await ensureE2EProducts()).widgetId;
});
test.afterAll(async () => {
  await teardownE2EProducts();
});

test.beforeEach(async ({ page }) => {
  // Clear any cart pollution from a prior run before navigating.
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("shop_cart_v1"));
});

// Guest add-to-cart on the product detail page is gated behind login
// (ProductInteractions.tsx:42 — "Please log in to add items to cart"),
// so we seed the guest cart directly via localStorage. CartContext loads
// items from `shop_cart_v1` on mount when no session is present.
function seedGuestCart(productId: string, quantity = 1) {
  return (args: { productId: string; quantity: number }) => {
    const cart = {
      v: 1,
      savedAt: Date.now(),
      items: [
        {
          type: "product",
          productId: args.productId,
          quantity: args.quantity,
          price: 25,
          product: {
            _id: args.productId,
            name: "test-shop-e2e-widget",
            price: 25,
            images: ["https://placehold.co/400"],
            brand: "test",
            stock: 10,
          },
        },
      ],
    };
    localStorage.setItem("shop_cart_v1", JSON.stringify(cart));
  };
}

test("header cart icon shows count badge after adding a product", async ({ page }) => {
  await page.goto("/shop");

  const cartButton = page.getByRole("button", { name: /open cart/i });
  await expect(cartButton).toBeVisible();
  // No badge yet — the count <span> only renders when totalItems > 0
  await expect(cartButton.locator("span")).toHaveCount(0);

  // Seed cart in localStorage and reload — guest cart hydrates from there.
  await page.evaluate(seedGuestCart(productId), { productId, quantity: 1 });
  await page.reload();

  // Badge appears with count "1"
  await expect(cartButton.locator("span")).toContainText("1", { timeout: 5_000 });

  // Open the sidebar and verify the cart contains the item
  await cartButton.click();
  await expect(page.getByRole("link", { name: /proceed to checkout/i })).toBeVisible();
});

test("badge clears after cart is emptied", async ({ page }) => {
  // Seed cart first, then load page — badge should render immediately.
  await page.goto("/shop");
  await page.evaluate(seedGuestCart(productId), { productId, quantity: 1 });
  await page.reload();

  const cartButton = page.getByRole("button", { name: /open cart/i });
  await expect(cartButton.locator("span")).toContainText("1", { timeout: 5_000 });

  // Clear localStorage cart and reload — guest carts source from localStorage on mount
  await page.evaluate(() => localStorage.removeItem("shop_cart_v1"));
  await page.reload();

  await expect(cartButton.locator("span")).toHaveCount(0);
});
