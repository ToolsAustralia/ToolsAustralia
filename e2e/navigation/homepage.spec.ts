import { test, expect } from "../fixtures/test";

// Guest spec — landing on `/` should serve a 200, render the hero h1, and expose at
// least one membership/shop CTA. We deliberately avoid hard-coding testids here so
// the spec doubles as a smoke check for the marketing-side DOM.
test.describe("homepage", () => {
  test("renders hero h1 and at least one primary CTA", async ({ page }) => {
    const response = await page.goto("/");

    expect(response, "navigation response should not be null").not.toBeNull();
    expect(response!.status(), "homepage should return 200").toBeLessThan(400);

    // Hero h1 is rendered by `<Hero />` (src/components/sections/Hero.tsx) — there
    // are mobile + desktop variants; require at least one visible h1.
    const heroHeading = page.getByRole("heading", { level: 1 }).first();
    await expect(heroHeading).toBeVisible({ timeout: 5_000 });

    // Primary CTAs include "Shop Now", "Become a Member", "Join", "Membership".
    // Use a permissive regex so a copy refresh doesn't break the spec.
    const primaryCta = page
      .getByRole("link", { name: /shop|member|join|browse|view (shop|all)/i })
      .first();
    await expect(primaryCta).toBeVisible({ timeout: 5_000 });
  });
});
