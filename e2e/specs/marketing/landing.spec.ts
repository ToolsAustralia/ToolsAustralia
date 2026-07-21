import { test, expect } from "../../fixtures/test";

test.describe("landing @smoke @demo", () => {
  test("renders hero and membership CTAs", async ({ page }) => {
    await page.goto("/");
    // Deviation from brief (documented in task-6-report.md): the landing page renders
    // membership tier cards via the shared MembershipSection/ElectricPackageCard, whose
    // CTA label defaults to "Enter Now" for a guest with no active subscription (see
    // src/components/sections/MembershipSection.tsx:503-509 and
    // src/components/sections/membership/ElectricPackageCard.tsx:299 — ctaLabel ?? "Enter Now").
    // Only the /membership page's useMembershipCardCta hook renders "Choose {tier}" labels.
    // Verified live: 0 "Choose Tradie" button/link, 4 "Enter Now" button/link on "/".
    await expect(page.getByRole("button", { name: /enter now/i }).or(page.getByRole("link", { name: /enter now/i })).first()).toBeVisible({ timeout: 20_000 });
  });
});
