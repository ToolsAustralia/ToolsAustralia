import { test, expect } from "../fixtures/test";

// /shop/brand/[brand] landing page sanity check.
//
// Investigation summary:
//   - Route source: src/app/(site)/shop/brand/[brand]/page.tsx — a server
//     component that looks up `BRAND_DETAILS[brand]` and `notFound()`s for
//     unknown slugs. "dewalt" is a known slug. (Display name is "DeWALT".)
//   - It renders a hero with H1 `${brand.name} at Tools Australia` and the
//     same <ShopContent /> client used by /shop, but with `defaultBrand`
//     pre-applied so the brand filter is locked on.
//   - SEO breadcrumb JSON-LD is emitted ("Home > Shop > DeWALT Tools").

test("brand landing page renders for a known brand slug", async ({ page }) => {
  await page.goto("/shop/brand/dewalt");

  // H1 mirrors `${brand.name} at Tools Australia` — assert via role.
  await expect(
    page.getByRole("heading", { level: 1, name: /DeWALT at Tools Australia/i }),
  ).toBeVisible();

  // Wait for the embedded <ShopContent> to finish loading the filtered list.
  await expect(page.locator("text=/Showing \\d+|No products found/i").first()).toBeVisible({
    timeout: 10_000,
  });
});

test("brand landing page filter is pre-applied (only that brand's products)", async ({
  page,
}) => {
  await page.goto("/shop/brand/dewalt");

  await expect(page.locator("text=/Showing \\d+|No products found/i").first()).toBeVisible({
    timeout: 10_000,
  });

  // The "Refine Products" sidebar reports "1 active filter(s)" because
  // `defaultBrand` populates the brands array on mount.
  await expect(page.locator("text=/1 active filter\\(s\\)/i")).toBeVisible({
    timeout: 5_000,
  });
});
