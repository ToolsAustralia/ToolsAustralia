import assert from "node:assert/strict";
import {
  buildCouponParams,
  retentionDiscountBlockReason,
  RETENTION_COUPON_ID,
} from "../RetentionDiscountService";

// ---------------------------------------------------------------------------
// buildCouponParams — exact-value assertions (pure, no Stripe)
// ---------------------------------------------------------------------------

function testBuildCouponParamsExactValues() {
  const params = buildCouponParams();
  assert.strictEqual(params.id, RETENTION_COUPON_ID);
  assert.strictEqual(params.id, "retention-50off-2mo");
  assert.strictEqual(params.percent_off, 50);
  assert.strictEqual(params.duration, "repeating");
  assert.strictEqual(params.duration_in_months, 2);
  assert.strictEqual(params.name, "50% off for 2 months (retention)");
}

function testBuildCouponParamsShapeOnly() {
  // Exactly these five keys — no amount_off / currency / max_redemptions.
  const params = buildCouponParams();
  const keys = Object.keys(params).sort();
  assert.deepStrictEqual(keys, [
    "duration",
    "duration_in_months",
    "id",
    "name",
    "percent_off",
  ]);
}

// ---------------------------------------------------------------------------
// retentionDiscountBlockReason — guard logic (pure, no DB/Stripe)
// ---------------------------------------------------------------------------

type UserLike = Parameters<typeof retentionDiscountBlockReason>[0];

/** Helper: build a minimal user-like object. */
function makeUser(overrides: Partial<UserLike> = {}): UserLike {
  return {
    subscription: {
      packageId: "pro",
      startDate: new Date(),
      isActive: true,
      autoRenew: true,
      status: "active",
    },
    retentionOffersConsumed: { discount50_2mo: false },
    stripeSubscriptionId: "sub_test123",
    ...overrides,
  } as unknown as UserLike;
}

function testBlockReasonPastDue() {
  const user = makeUser({
    subscription: {
      packageId: "pro",
      startDate: new Date(),
      isActive: false,
      autoRenew: true,
      status: "past_due",
    },
  });
  const reason = retentionDiscountBlockReason(user);
  assert.ok(reason !== null, "should block past-due user");
  assert.ok(reason!.includes("past-due"), `expected 'past-due' in: "${reason}"`);
}

function testBlockReasonAlreadyConsumed() {
  const user = makeUser({
    retentionOffersConsumed: { discount50_2mo: true },
  });
  const reason = retentionDiscountBlockReason(user);
  assert.ok(reason !== null, "should block already-consumed user");
  assert.ok(reason!.includes("already used"), `expected 'already used' in: "${reason}"`);
}

function testBlockReasonNoSubscription() {
  const user = makeUser({ stripeSubscriptionId: undefined });
  const reason = retentionDiscountBlockReason(user);
  assert.ok(reason !== null, "should block user with no subscription id");
  assert.ok(
    reason!.includes("no active subscription"),
    `expected 'no active subscription' in: "${reason}"`
  );
}

function testBlockReasonEligibleUser() {
  const user = makeUser();
  const reason = retentionDiscountBlockReason(user);
  assert.strictEqual(reason, null, "eligible user should return null");
}

/** Past-due guard takes priority over consumed guard. */
function testBlockReasonPastDueTakesPriority() {
  const user = makeUser({
    subscription: {
      packageId: "pro",
      startDate: new Date(),
      isActive: false,
      autoRenew: true,
      status: "past_due",
    },
    retentionOffersConsumed: { discount50_2mo: true },
  });
  const reason = retentionDiscountBlockReason(user);
  assert.ok(reason !== null);
  assert.ok(reason!.includes("past-due"), `expected past-due to take priority: "${reason}"`);
}

/** Missing retentionOffersConsumed entirely (undefined) → treated as not consumed. */
function testBlockReasonUndefinedConsumedFlag() {
  const user = makeUser({ retentionOffersConsumed: undefined });
  const reason = retentionDiscountBlockReason(user);
  assert.strictEqual(reason, null, "undefined retentionOffersConsumed should not block");
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

function run() {
  testBuildCouponParamsExactValues();
  testBuildCouponParamsShapeOnly();
  testBlockReasonPastDue();
  testBlockReasonAlreadyConsumed();
  testBlockReasonNoSubscription();
  testBlockReasonEligibleUser();
  testBlockReasonPastDueTakesPriority();
  testBlockReasonUndefinedConsumedFlag();
  console.log("PASS RetentionDiscountService");
}

run();
