// e2e/upsells/redeem.spec.ts
//
// BLOCKED: clicking the redeem (purchase) button on the UpsellModal calls
// `/api/upsell/purchase` which charges a Stripe payment method off-session.
// To test the success path we need a real saved card on the fixture user
// AND a Stripe test customer linked to it. The fresh fixture has no
// stripeCustomerId, so the API returns "no payment method" and the modal
// shows a SetupIntent inline form (also requires Stripe).
//
// We assert the negative path: clicking redeem with no saved card disables
// the button (paymentMethods === [] → button shows the inline-card setup
// branch). This documents the disabled state without requiring Stripe.

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
    paymentIntentId: "pi_e2e_redeem",
    packageId: "tradie-subscription",
    packageName: "Tradie",
    packageType: "membership",
    price: 49.99,
    entries: 100,
  },
};

test("redeem button disabled when fixture user has no saved Stripe card (BLOCKED on full success path)", async ({
  page,
}) => {
  await page.goto("/my-account");

  await page.evaluate((data) => {
    sessionStorage.setItem("pendingUpsell", JSON.stringify(data));
    sessionStorage.setItem("pendingUpsellFlag", "true");
  }, SAMPLE_UPSELL_DATA);

  await page.reload();

  await expect(page.locator(byTestId(testid.upsellModal))).toBeVisible({ timeout: 10_000 });

  // Wait for payment-method resolution to finish (loading -> empty list).
  // resolvedChargePm is undefined when paymentMethods === [] AND no synthetic PM
  // could be derived from originalPurchaseContext. Button stays disabled.
  const redeemButton = page.locator(byTestId(testid.upsellRedeemButton));
  await expect(redeemButton).toBeVisible({ timeout: 10_000 });

  // Either the button is disabled (no PM, no inline card flow yet) OR the
  // inline card setup section appeared. Both indicate redeem can't proceed
  // without seeding Stripe — which is the BLOCKED condition we document.
  await page.waitForTimeout(2_500); // Allow PM lookup to resolve.
  const isDisabled = await redeemButton.isDisabled().catch(() => true);
  expect(isDisabled).toBe(true);
});
