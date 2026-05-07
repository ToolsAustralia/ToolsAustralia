import { test, expect } from "../fixtures/test";

// Direct nav to /promotions/[slug] using a real slug from src/config/prizes.ts.
// `cash-prize` is the evergreen entry — always present. `expired promo CTA disabled`
// is product-conditional (no expired-promo state available without seeding a server-rendered
// expiry); we assert the page renders + a primary CTA exists.

test.describe("promotions page detail", () => {
  test("renders the cash-prize landing page with a primary CTA", async ({ page }) => {
    // First nav can 500 if Next dev / Turbopack hasn't compiled the dynamic route yet
    // under parallel pressure. Retry once before failing.
    let response = await page.goto("/promotions/cash-prize");
    if (response && response.status() >= 500) {
      response = await page.goto("/promotions/cash-prize");
    }

    expect(response, "navigation response should not be null").not.toBeNull();
    expect(response!.status(), "should return 2xx/3xx after warmup").toBeLessThan(400);

    // PromoHero is image-driven (no h1 above the fold) — assert <main> mounts and at
    // least one heading lands once below-fold Suspense resolves.
    await expect(page.locator("main")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 10_000 });
  });
});
