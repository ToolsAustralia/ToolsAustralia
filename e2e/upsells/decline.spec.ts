// e2e/upsells/decline.spec.ts
//
// Open the UpsellModal via the production sessionStorage handoff, click the
// "No thanks, maybe later" decline button, assert the modal closes.

import { test, expect } from "../fixtures/test";
import { byTestId, testid } from "../utils/selectors";

const SAMPLE_UPSELL_DATA = {
  offer: {
    id: "major-draw-special",
    title: "Double Your Value - Major Draw Special!",
    description: "You just got entries!",
    category: "major-draw",
    originalPrice: 100,
    discountedPrice: 50,
    discountPercentage: 50,
    entriesCount: 300,
    buttonText: "Double My Entries - $50",
    conditions: ["300 Major Draw Entries"],
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
    totalSpent: 0,
    upsellsShown: 0,
  },
  originalPurchaseContext: {
    paymentIntentId: "pi_e2e_decline",
    packageId: "tradie-subscription",
    packageName: "Tradie",
    packageType: "membership",
    price: 49.99,
    entries: 100,
  },
};

test("clicking decline closes the UpsellModal", async ({ page }) => {
  await page.goto("/my-account");

  await page.evaluate((data) => {
    sessionStorage.setItem("pendingUpsell", JSON.stringify(data));
    sessionStorage.setItem("pendingUpsellFlag", "true");
  }, SAMPLE_UPSELL_DATA);

  await page.reload();

  const modal = page.locator(byTestId(testid.upsellModal));
  await expect(modal).toBeVisible({ timeout: 10_000 });

  await page.locator(byTestId(testid.upsellDeclineButton)).click();

  await expect(modal).toBeHidden({ timeout: 5_000 });
});
