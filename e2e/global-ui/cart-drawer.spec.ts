// e2e/global-ui/cart-drawer.spec.ts
//
// Guest adds a product, opens the cart drawer via the header cart icon,
// uses +/- and remove inside the drawer, and verifies the "Proceed to
// Checkout" link navigates to /shop/checkout.
import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";
import { ensureE2EProducts, teardownE2EProducts } from "../fixtures/test-products";

test.describe.configure({ mode: "serial" });

let productId: string;

test.beforeAll(async () => {
  productId = (await ensureE2EProducts()).widgetId;
});
test.afterAll(async () => {
  await teardownE2EProducts();
});

// Klaviyo blocking is centralised in e2e/fixtures/test.ts (network + DOM).

// Helper: seed a guest cart entry directly via localStorage. Guest add-to-cart
// on the product detail page is blocked by ProductInteractions.tsx:42 which
// alerts and returns early when there is no session. CartContext picks up the
// localStorage entry on mount for unauthenticated users.
function seedGuestCart(productId: string) {
  return (args: { productId: string }) => {
    const cart = {
      v: 1,
      savedAt: Date.now(),
      items: [
        {
          type: "product",
          productId: args.productId,
          quantity: 1,
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

test("cart drawer: opens, qty +/-/remove, checkout navigates", async ({ page }) => {
  // Clear pollution then seed cart and reload.
  await page.goto("/");
  await page.evaluate(() => localStorage.removeItem("shop_cart_v1"));
  await page.evaluate(seedGuestCart(productId), { productId });
  await page.goto(`/shop/${productId}`);

  // Header cart icon → drawer opens. The PDP renders mobile + desktop variants
  // of the header so the testid resolves to 2 elements; pick the visible one.
  const cartIcon = page.locator(byTestId(testid.headerCartIcon)).first();
  await expect(cartIcon).toBeVisible();
  // Strip the Klaviyo POPUP dialog if it slipped past the route-block (e.g.
  // bundled inline). It overlays the header at z-index above the cart icon.
  await page.evaluate(() => {
    document
      .querySelectorAll('div[role="dialog"][aria-label="POPUP Form"]')
      .forEach((el) => el.remove());
  });
  await cartIcon.click({ force: true });

  const drawer = page.locator(byTestId(testid.headerCartDrawer));
  await expect(drawer).toBeVisible({ timeout: 5_000 });
  await expect(drawer.getByRole("heading", { name: /shopping cart/i })).toBeVisible();

  // Drawer-scoped controls. The cart row markup uses unbranded buttons so we
  // target by lucide icon ARIA fallback (Plus/Minus/Trash2 -> button-with-svg).
  const qtyDisplay = drawer.locator("span.text-sm.font-medium.w-8.text-center").first();
  await expect(qtyDisplay).toHaveText("1");

  // The drawer renders Plus/Minus/Trash2 lucide icons inside three sibling
  // <button>s with no aria-label. Get them by relative position within the row.
  const itemRow = drawer.locator("div.flex.items-center.gap-3.p-3").first();
  const buttons = itemRow.locator("button");
  // [0]=minus, [1]=plus, [2]=remove
  await buttons.nth(1).click();
  await expect(qtyDisplay).toHaveText("2", { timeout: 3_000 });

  await buttons.nth(0).click();
  await expect(qtyDisplay).toHaveText("1", { timeout: 3_000 });

  // Remove
  await buttons.nth(2).click();
  // After removal the empty-state ("Coming Soon") renders inside the drawer.
  await expect(drawer.getByRole("heading", { name: /coming soon/i })).toBeVisible({ timeout: 3_000 });

  // Re-seed (cart is empty after removal) and verify checkout link navigates.
  await page.evaluate(seedGuestCart(productId), { productId });
  await page.reload();
  await page.locator(byTestId(testid.headerCartIcon)).first().click();
  await expect(page.locator(byTestId(testid.headerCartDrawer))).toBeVisible();

  await page.getByRole("link", { name: /proceed to checkout/i }).click();
  await expect(page).toHaveURL(/\/shop\/checkout$/);
});
