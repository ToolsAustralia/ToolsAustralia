import { test, expect } from "../fixtures/test";

// /shop product list + brand filter sanity check.
//
// Investigation summary:
//   - Filtering is purely client-side: src/components/features/ShopContent.tsx
//     holds a `filters.brands: string[]` in React state and passes it to the
//     `useProducts` query as `brand: string[]`. There are no URL search params.
//   - Brand filter buttons live in src/components/features/ProductFilters.tsx
//     and render plain <button> elements with the brand name as their text
//     ("DeWalt", "Makita", "Milwaukee", "Kincrome", "Sidchrome"). We click by
//     role+name. They appear in a desktop sidebar (hidden lg:block) so we
//     stay on a desktop viewport (the default in playwright.config.ts).
//   - Product cards render via src/components/ui/ProductCard.tsx — no
//     data-testid yet, so we count the rendered cards via the grid wrapper +
//     visible product price elements ($NN format). That keeps the assertion
//     resilient to card markup tweaks.

test("shop page renders product grid", async ({ page }) => {
  await page.goto("/shop");

  // The product grid renders client-side via React Query, so wait for the
  // results header to settle on a real count (not the transient
  // "No products found" that flashes before the first fetch resolves).
  await expect(page.locator("text=/Showing \\d+/i").first()).toBeVisible({
    timeout: 30_000,
  });

  // At least one product card must be present (seeded shop products).
  const addToCartButtons = page.getByRole("button", { name: /add to cart/i });
  expect(await addToCartButtons.count()).toBeGreaterThan(0);
});

test("brand filter narrows visible products", async ({ page }) => {
  await page.goto("/shop");

  await expect(page.locator("text=/Showing \\d+/i").first()).toBeVisible({
    timeout: 30_000,
  });

  // Capture unfiltered product count
  const unfilteredCount = await page
    .getByRole("button", { name: /add to cart/i })
    .count();
  expect(unfilteredCount).toBeGreaterThan(0);

  // Apply the DeWalt brand filter (desktop sidebar — visible at the default
  // 1280x720 viewport). The button text is just the brand name, so anchor
  // with ^$ to avoid matching "DeWalt 18V Cordless..." product names.
  await page.getByRole("button", { name: /^DeWalt$/i }).click();

  // Results header should re-render with the new count
  await expect(page.locator("text=/Showing \\d+|No products found/i").first()).toBeVisible({
    timeout: 5_000,
  });

  const filteredCount = await page
    .getByRole("button", { name: /add to cart/i })
    .count();
  // Either fewer results, OR the same products if all are DeWalt — assert
  // the filter was actually applied via the "1 filter(s) applied" footer.
  await expect(page.locator("text=/1 filter\\(s\\) applied/i")).toBeVisible({
    timeout: 5_000,
  });
  expect(filteredCount).toBeLessThanOrEqual(unfilteredCount);
});
