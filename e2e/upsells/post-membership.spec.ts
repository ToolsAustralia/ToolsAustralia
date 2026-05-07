// e2e/upsells/post-membership.spec.ts
//
// Verifies the UpsellModal opens via the production sessionStorage handoff
// path used by my-account/page.tsx (lines 190-208). We seed `pendingUpsell`
// + `pendingUpsellFlag` on the /my-account origin, reload, and assert the
// modal is visible. We do NOT walk the full membership purchase flow —
// that would require Stripe and is covered by membership specs.

import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";

const SAMPLE_UPSELL_DATA = {
  offer: {
    id: "major-draw-special",
    title: "Double Your Value - Major Draw Special!",
    description: "You just got entries! Want twice the entries at this special rate?",
    category: "major-draw",
    originalPrice: 100,
    discountedPrice: 50,
    discountPercentage: 50,
    entriesCount: 300,
    buttonText: "Double My Entries - $50",
    conditions: [
      "300 Major Draw Entries (3x normal value!)",
      "One-time purchase - no subscription changes",
    ],
    urgencyText: "Only 24 hours left!",
    validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    priority: 10,
    imageUrl: "/images/promotion/PrizeHeader/PrizeHeader.webp",
    isActive: true,
    targetAudience: ["all-users"],
    userSegments: ["new-user", "returning-user"],
    maxShowsPerUser: 3,
    cooldownHours: 24,
  },
  userContext: {
    isAuthenticated: true,
    hasDefaultPayment: false,
    recentPurchase: "membership",
    userType: "returning-user",
    totalSpent: 49.99,
    upsellsShown: 0,
  },
  originalPurchaseContext: {
    paymentIntentId: "pi_e2e_post_membership",
    packageId: "tradie-subscription",
    packageName: "Tradie",
    packageType: "membership",
    price: 49.99,
    entries: 100,
  },
};

test("UpsellModal opens after membership purchase via sessionStorage handoff", async ({ page }) => {
  // Land on /my-account first to establish origin so sessionStorage writes
  // are scoped correctly. The page may show the user-setup modal — that's OK,
  // we'll re-trigger after seeding sessionStorage.
  await page.goto("/my-account");

  await page.evaluate((data) => {
    sessionStorage.setItem("pendingUpsell", JSON.stringify(data));
    sessionStorage.setItem("pendingUpsellFlag", "true");
    // NB: do NOT set setupJustCompleted — that flag triggers an early return
    // in my-account/page.tsx (line 184-188) and would suppress the upsell.
  }, SAMPLE_UPSELL_DATA);

  // Reload — the effect in my-account/page.tsx (lines 190-208) reads the
  // sessionStorage flag and calls requestModal("upsell", true, data).
  await page.reload();

  await expect(page.locator(byTestId(testid.upsellModal))).toBeVisible({ timeout: 10_000 });
});
