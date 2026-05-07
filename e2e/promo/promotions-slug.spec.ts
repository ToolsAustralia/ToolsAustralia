import { test, expect } from "../fixtures/test";

// Coverage for the dynamic /promotions/[slug] route AND the brand-specific
// /promotions/<brand> landing pages. The previous /promotion/giveaway redirect
// is broken (404) and is NOT tested here.
//
// Slugs come from src/config/prizes.ts (13 total). We exercise:
//   - cash-prize        — evergreen non-brand prize
//   - milwaukee-sidchrome — brand-tied prize
//   - milwaukee, dewalt, makita, ryobi — brand-specific landing pages

const SLUG_ROUTES = [
  { path: "/promotions/cash-prize", label: "evergreen cash-prize" },
  { path: "/promotions/milwaukee-sidchrome", label: "brand-tied milwaukee-sidchrome" },
];

const BRAND_ROUTES = [
  { path: "/promotions/dewalt", label: "DeWalt landing" },
  { path: "/promotions/makita", label: "Makita landing" },
  { path: "/promotions/milwaukee", label: "Milwaukee landing" },
  { path: "/promotions/ryobi", label: "Ryobi landing" },
];

test.describe("promotions /[slug] dynamic route", () => {
  for (const { path, label } of SLUG_ROUTES) {
    test(`${label} renders`, async ({ page }) => {
      // Cold-compile retry — Turbopack can 500 the first hit on a dynamic route.
      let response = await page.goto(path);
      if (response && response.status() >= 500) {
        response = await page.goto(path);
      }
      expect(response, `${path} response should not be null`).not.toBeNull();
      expect(response!.status(), `${path} should return 2xx/3xx after warmup`).toBeLessThan(400);

      // PromoHero is image-driven so no top h1 above the fold; assert <main>
      // hydrates and the first heading appears once below-fold Suspense resolves.
      await expect(page.locator("main")).toBeVisible({ timeout: 5_000 });
      await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 10_000 });
    });
  }
});

test.describe("promotions /<brand> landing pages", () => {
  for (const { path, label } of BRAND_ROUTES) {
    test(`${label} renders`, async ({ page }) => {
      let response = await page.goto(path);
      if (response && response.status() >= 500) {
        response = await page.goto(path);
      }
      expect(response, `${path} response should not be null`).not.toBeNull();
      expect(response!.status(), `${path} should return 2xx/3xx after warmup`).toBeLessThan(400);

      // Brand pages all use the shared ToolsetLandingPage component; assert
      // <main> mounts. Toolset pages may have an h1 but they may also be
      // image-driven — keep the assertion permissive.
      await expect(page.locator("main")).toBeVisible({ timeout: 5_000 });
    });
  }
});
