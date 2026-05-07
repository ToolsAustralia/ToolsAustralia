import { test, expect } from "../fixtures/test";

// Serial: shares the tradie-w<N> fixture user with mutating membership specs
// (upgrade/cancel/etc). Reads only, but serial mode prevents cross-file races.
test.describe.configure({ mode: "serial" });

// Tradie member visits /my-account dashboard. The PartnerDiscountsSection
// (UnlockDiscounts component) renders the partner discount cards because
// hasActivePartnerDiscountAccess === true for an active subscription.
test.describe("Partner discounts — member view", () => {
  test("active member sees the Partner Discounts section with brand cards", async ({ page }) => {
    await page.goto("/my-account");

    // Wait for dashboard hydration
    await expect(page.locator(".my-account-partner-discounts")).toBeVisible({ timeout: 15_000 });

    // Title — for tradie tier the active subscription path renders "Partner Discounts"
    await expect(
      page.getByRole("heading", { level: 2, name: /Partner Discounts/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    // At least one partner brand card link (each is an <a target="_blank">) inside the section.
    const partnerSection = page.locator(".my-account-partner-discounts");
    const cards = partnerSection.locator("a[target='_blank'][rel*='noopener']");
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    expect(await cards.count()).toBeGreaterThan(0);
  });
});
