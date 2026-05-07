// e2e/url-params/3ds-return-handling.spec.ts
//
// BLOCKED per the e2e plan url-params batch contract:
//
// Visiting `/purchase-success?payment_intent_client_secret=<cs>` invokes
// PaymentSuccessHandler → use3DSRedirectHandler (src/hooks/use3DSRedirectHandler.ts)
// which calls `stripe.retrievePaymentIntent(clientSecret)` against the LIVE Stripe
// API. Asserting all four status branches (loading/processing/failed/succeeded)
// requires four distinct REAL PaymentIntents in matching states. We do not have
// (and the contract explicitly forbids fabricating) a deterministic way to spin
// up real PaymentIntents in each Stripe state from a Playwright spec, and the
// hook does not consult any in-app code path that we could mock at the network
// layer (the call goes through @stripe/stripe-js to api.stripe.com).
//
// To unblock: either (a) add a debug-only dev route that exposes a way to drive
// the four PaymentIntent states server-side, or (b) refactor the hook to read
// status from /api/payment-status/[id] (which we DO control) and intercept
// that. Both are production changes and the writing-playwright-spec rules forbid
// refactoring production code beyond adding testids — so the spec stays SKIPPED
// until that work happens.
//
// The "idle" branch (no clientSecret) is implicitly covered by the existing
// shop checkout success specs — they land on /shop/checkout/success without
// the param and render the success children directly.

import { test } from "../fixtures/test";

test.skip("3DS return rendering — BLOCKED: requires real Stripe PaymentIntents", () => {
  // Intentionally empty. See file header for unblock plan.
});
