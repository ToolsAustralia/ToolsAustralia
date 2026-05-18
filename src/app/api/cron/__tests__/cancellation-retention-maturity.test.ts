import assert from "node:assert/strict";
import {
  maturedFilter,
  isRetained,
  NINETY_DAYS_MS,
} from "../cancellation-retention-maturity/route";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date("2026-05-18T10:00:00.000Z");

// ---------------------------------------------------------------------------
// maturedFilter
// ---------------------------------------------------------------------------

function testMaturedFilterShapeAndDateMath() {
  const filter = maturedFilter(NOW);

  // Exact shape: outcome=saved, savedAt $lte, retention90 null.
  assert.deepEqual(Object.keys(filter).sort(), [
    "outcome",
    "retention90",
    "savedAt",
  ]);
  assert.equal(filter.outcome, "saved");
  assert.equal(filter.retention90, null);
  assert.deepEqual(Object.keys(filter.savedAt), ["$lte"]);

  // The $lte cutoff is EXACTLY now - 90d (matches the analytics shaper's
  // `matured` cutoff: savedAt <= now - NINETY_DAYS_MS).
  const expected = new Date(NOW.getTime() - NINETY_DAYS_MS);
  assert.equal(filter.savedAt.$lte.getTime(), expected.getTime());
  assert.equal(NINETY_DAYS_MS, 90 * 24 * 60 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// isRetained — mirrors getActiveSubscriptionFilter (userFilterBuilder.ts:42)
// ---------------------------------------------------------------------------

function testActiveRecurringSubscriberIsRetained() {
  // All four canonical conditions met → retained.
  assert.equal(
    isRetained({
      isActive: true,
      subscription: { isActive: true, autoRenew: true, status: "active" },
    }),
    true,
    "active + recurring + status=active → retained"
  );

  // autoRenew undefined defaults to recurring (mirrors `$ne: false`).
  assert.equal(
    isRetained({
      isActive: true,
      subscription: { isActive: true, status: "active" },
    }),
    true,
    "autoRenew undefined → still recurring (default true) → retained"
  );

  // trialing counts as an entitled active membership.
  assert.equal(
    isRetained({
      isActive: true,
      subscription: { isActive: true, autoRenew: true, status: "trialing" },
    }),
    true,
    "status=trialing → retained"
  );
}

function testNonActiveSubscriberIsChurned() {
  // Cancelled subscription: not active.
  assert.equal(
    isRetained({
      isActive: true,
      subscription: { isActive: false, autoRenew: false, status: "canceled" },
    }),
    false,
    "cancelled subscription → churned"
  );

  // No subscription at all.
  assert.equal(
    isRetained({ isActive: true, subscription: null }),
    false,
    "no subscription → churned"
  );
  assert.equal(
    isRetained({ isActive: true }),
    false,
    "subscription absent → churned"
  );

  // Past-due (still has a sub doc but status not in active/trialing).
  assert.equal(
    isRetained({
      isActive: true,
      subscription: { isActive: false, autoRenew: true, status: "past_due" },
    }),
    false,
    "past_due (not active) → churned"
  );

  // autoRenew explicitly false → cancellation scheduled, not recurring.
  assert.equal(
    isRetained({
      isActive: true,
      subscription: { isActive: true, autoRenew: false, status: "active" },
    }),
    false,
    "autoRenew=false (will not renew) → churned"
  );

  // User account deactivated even though sub looks active.
  assert.equal(
    isRetained({
      isActive: false,
      subscription: { isActive: true, autoRenew: true, status: "active" },
    }),
    false,
    "user account inactive → churned"
  );

  // Missing user (deleted account) → churned.
  assert.equal(isRetained(null), false, "null user → churned");
  assert.equal(isRetained(undefined), false, "undefined user → churned");
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function run() {
  testMaturedFilterShapeAndDateMath();
  testActiveRecurringSubscriberIsRetained();
  testNonActiveSubscriberIsChurned();
  console.log("cancellation-retention-maturity tests passed");
}

try {
  run();
} catch (err) {
  console.error(err);
  process.exit(1);
}
