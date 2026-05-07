import { test, expect } from "../fixtures/test";

// Fresh user (no active subscription, no one-time package) visits /my-account.
// PartnerDiscountsSection renders <UnlockDiscounts hasAccess={false}> with
// title "Unlock Partner Discounts" and the "ENTER TO UNLOCK DISCOUNT" CTA.
test.describe("Partner discounts — eligibility CTA for non-member", () => {
  test("non-member sees Unlock Partner Discounts CTA on /my-account", async ({ page }) => {
    await page.goto("/my-account");

    // Wait for dashboard to render the partner section.
    const section = page.locator(".my-account-partner-discounts");
    await expect(section).toBeVisible({ timeout: 15_000 });

    // The non-member title is "Unlock Partner Discounts".
    await expect(
      section.getByRole("heading", { level: 2, name: /Unlock Partner Discounts/i })
    ).toBeVisible({ timeout: 10_000 });

    // The CTA button — text is split across responsive spans.
    await expect(section.getByRole("button", { name: /UNLOCK DISCOUNT/i })).toBeVisible({
      timeout: 5_000,
    });
  });
});
