import { test, expect } from "../../fixtures/test";

test.describe("landing @smoke @demo", () => {
  test("renders hero and membership CTAs", async ({ page, demo }) => {
    // Client-facing opening card for proof mode (demo.ts reads this annotation).
    test.info().annotations.push({
      type: "demo-title",
      description: "A tour of the Tools Australia home page",
    });
    // Warm the route BEFORE the first demo.step, not inside it — see the identical
    // comment in purchase-via-showcase.spec.ts / demo.ts's showCaption: the caption
    // overlay paints on whatever page is currently loaded the instant demo.step is
    // called, so navigating INSIDE the first step showed the opening caption over the
    // still-blank tab (video-review.md Judge R: "opening beat never captions over a
    // blank page"). `section.hero-section` is the single Hero wrapper — the largest,
    // first-painted landmark on "/".
    await page.goto("/");
    await expect(page.locator("section.hero-section")).toBeVisible({ timeout: 45_000 });

    await demo.step("Opening the Tools Australia home page", async () => {
      await expect(page.locator("section.hero-section")).toBeVisible();
    });
    // Deviation from brief (documented in task-6-report.md): the landing page renders
    // membership tier cards via the shared MembershipSection/ElectricPackageCard, whose
    // CTA label defaults to "Enter Now" for a guest with no active subscription (see
    // src/components/sections/MembershipSection.tsx:503-509 and
    // src/components/sections/membership/ElectricPackageCard.tsx:299 — ctaLabel ?? "Enter Now").
    // Only the /membership page's useMembershipCardCta hook renders "Choose {tier}" labels.
    // Verified live: 0 "Choose Tradie" button/link, 4 "Enter Now" button/link on "/".
    await demo.step("Membership options with free entries are on display", async () => {
      await expect(page.getByRole("button", { name: /enter now/i }).or(page.getByRole("link", { name: /enter now/i })).first()).toBeVisible({ timeout: 20_000 });
    });
    // Prize-showcase demo moment (added 2026-07-22 at DJ's request): scroll the
    // "Build your prize" showcase into frame so proof-mode videos capture the new
    // section. Anchor on its 8px kit sublabels — unique to the showcase cards.
    await demo.step("The Build-your-prize showcase presents the tool prizes", async () => {
      const showcaseLabel = page.locator('[class*="text-[8.5px]"], [class*="text-[8px]"]').first();
      await demo.smoothScrollTo(showcaseLabel); // human-paced glide in proof mode, instant otherwise
      await expect(showcaseLabel).toBeVisible({ timeout: 20_000 });
    });
  });
});
