// e2e/upsells/attribution.spec.ts
//
// BLOCKED: the spec contract asks us to assert that PaymentEvent has an
// `original_payment_intent_id` field linking the upsell PI to the triggering
// purchase PI. A repo-wide grep confirms no production code writes that
// field today (only the plan doc references it). The schema in
// src/models/PaymentEvent.ts has no such property.
//
// Additionally, the upsell purchase flow goes Stripe → /api/stripe/webhook
// → grantBenefits → side-effects, so seeding "an upsell happened" requires
// either a full Stripe charge round-trip OR direct construction of multiple
// docs (PaymentEvent + UpsellPurchase if such a model existed) — neither
// of which is straightforward without the attribution field actually being
// implemented.
//
// We mark the spec skipped to surface the gap. When the attribution field
// is added to PaymentEvent, this spec should:
//   1. Seed an original PaymentEvent (membership PI).
//   2. Drive an upsell purchase (or postWebhook the upsell PI succeeded).
//   3. Query PaymentEvent for the upsell PI and assert
//      `original_payment_intent_id === <originalPiId>`.

import { test } from "../fixtures/test";

test.skip("PaymentEvent records original_payment_intent_id after upsell — BLOCKED: attribution field not implemented in src/models/PaymentEvent.ts", () => {
  // Intentionally empty. See header for unblock criteria.
});
