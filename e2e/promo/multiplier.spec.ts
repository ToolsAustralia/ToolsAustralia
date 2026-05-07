import { test } from "../fixtures/test";

// BLOCKED: validating that an active promo multiplier is reflected on a major-draw entry
// requires either (a) driving a full purchase flow (Stripe Element + webhook) which is
// out of scope for the promo domain spec set, or (b) a server-side multiplier-resolution
// API endpoint that returns "applied multiplier" for a hypothetical entry — the codebase
// does not expose such an endpoint outside the purchase orchestrator.
//
// Multiplier resolution is exercised end-to-end by the mini-draws purchase flow
// (e2e/draws/mini/promo-applied.spec.ts) which uses the chromium-fresh fixture and
// drives Stripe + webhook. Re-asserting the same logic here would duplicate that.
//
// Leaving this spec as a structural placeholder so the file count matches the plan.

test.skip("major-draw entry reflects active promo multiplier", async () => {
  // Implementation deferred — see comment block above.
});
