import { test } from "../fixtures/test";

// BLOCKED — feature does not exist in the codebase.
//
// Investigation:
//   - src/contexts/CartContext.tsx hard-codes `membershipDiscount: 0`
//     in `calculateSummary()` (line ~158). There is no calculation path
//     that reads the user's membership tier.
//   - src/app/(site)/shop/checkout/page.tsx renders an order summary with
//     subtotal/shipping/total but has no discount line, no member-discount
//     UI element, and no testid for one.
//   - The Order model HAS an `appliedDiscounts: { type: "membership"|... }`
//     array field, but nothing in the cart -> create-shop-purchase ->
//     finalizeShopOrder flow populates it with a membership-type entry.
//   - Stripe-side: ensureE2ECustomer / ensureE2ESubscription give the
//     tradie fixture a valid Stripe customer + active sub, but the shop
//     checkout PaymentElement does not query subscription state.
//
// Per spec contract: "If Stripe-side discount isn't surfaced via UI, BLOCK."
// The hooked `test.skip` keeps this file in the suite as a discoverable
// "feature gap" marker. Re-enable when:
//   1. CartContext calculates membershipDiscount based on the active sub.
//   2. Checkout page renders a discount line with data-testid="checkout-member-discount-line".
//   3. The discount flows through to PaymentIntent amount + Order.appliedDiscounts.

test.skip("member sees a discount line on /shop/checkout — feature not implemented", async () => {
  // intentionally empty
});
