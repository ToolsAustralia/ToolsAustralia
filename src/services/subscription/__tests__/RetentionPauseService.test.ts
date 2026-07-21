import assert from "node:assert/strict";
import { addMonths } from "date-fns";
import { computeResumeAt, retentionPauseBlockReason } from "../RetentionPauseService";

// ---------------------------------------------------------------------------
// computeResumeAt — resume = the member's NEXT billing-cycle boundary (period_end + 1 month),
// calendar-clamped, so exactly ONE cycle is skipped (NOT a fixed +30 days).
// ---------------------------------------------------------------------------

function testComputeResumeAtNextBoundary() {
  const periodEnd = new Date("2026-05-18T12:00:00.000Z");
  assert.strictEqual(computeResumeAt(periodEnd), Math.floor(addMonths(periodEnd, 1).getTime() / 1000));
  // 2026-05-18 + 1 month = 2026-06-18 (same day-of-month)
  assert.strictEqual(
    computeResumeAt(periodEnd),
    Math.floor(new Date("2026-06-18T12:00:00.000Z").getTime() / 1000)
  );
}

function testComputeResumeAtReturnValue() {
  const periodEnd = new Date("2026-01-01T00:00:00.000Z");
  const result = computeResumeAt(periodEnd);
  assert.ok(Number.isInteger(result), "result must be an integer (unix seconds)");
  // 2026-01-01 + 1 month = 2026-02-01
  assert.strictEqual(result, new Date("2026-02-01T00:00:00.000Z").getTime() / 1000);
}

// Month-end clamping: Jan 31 + 1 month → Feb 28 (2026 is not a leap year), NOT Mar 3 — the JS
// Date.setMonth overflow bug this fix avoids by using date-fns addMonths.
function testComputeResumeAtClampsShortMonth() {
  const periodEnd = new Date("2026-01-31T00:00:00.000Z");
  assert.strictEqual(
    computeResumeAt(periodEnd),
    Math.floor(new Date("2026-02-28T00:00:00.000Z").getTime() / 1000)
  );
}

// ---------------------------------------------------------------------------
// retentionPauseBlockReason — guard logic (pure, no DB/Stripe)
// ---------------------------------------------------------------------------

type UserLike = Parameters<typeof retentionPauseBlockReason>[0];

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
    retentionOffersConsumed: { pause30d: false },
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
  const reason = retentionPauseBlockReason(user);
  assert.ok(reason !== null, "should block past-due user");
  assert.ok(reason!.includes("past-due"), `expected 'past-due' in: "${reason}"`);
}

function testBlockReasonAlreadyConsumed() {
  const user = makeUser({
    retentionOffersConsumed: { pause30d: true },
  });
  const reason = retentionPauseBlockReason(user);
  assert.ok(reason !== null, "should block already-consumed user");
  assert.ok(reason!.includes("already used"), `expected 'already used' in: "${reason}"`);
}

function testBlockReasonNoSubscription() {
  const user = makeUser({ stripeSubscriptionId: undefined });
  const reason = retentionPauseBlockReason(user);
  assert.ok(reason !== null, "should block user with no subscription id");
  assert.ok(reason!.includes("no active subscription"), `expected 'no active subscription' in: "${reason}"`);
}

function testBlockReasonEligibleUser() {
  const user = makeUser();
  const reason = retentionPauseBlockReason(user);
  assert.strictEqual(reason, null, "eligible user should return null");
}

/** Scheduled to cancel (autoRenew off, still active) → blocked; the member resumes, doesn't pause. */
function testBlockReasonScheduledToCancel() {
  const user = makeUser({
    subscription: {
      packageId: "pro",
      startDate: new Date(),
      isActive: true,
      autoRenew: false,
      status: "active",
    },
  });
  const reason = retentionPauseBlockReason(user);
  assert.ok(reason !== null, "should block scheduled-to-cancel user");
  assert.ok(reason!.includes("scheduled to cancel"), `expected 'scheduled to cancel' in: "${reason}"`);
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
    retentionOffersConsumed: { pause30d: true },
  });
  const reason = retentionPauseBlockReason(user);
  assert.ok(reason !== null);
  assert.ok(reason!.includes("past-due"), `expected past-due to take priority: "${reason}"`);
}

/** Missing retentionOffersConsumed entirely (undefined) → treated as not consumed. */
function testBlockReasonUndefinedConsumedFlag() {
  const user = makeUser({ retentionOffersConsumed: undefined });
  const reason = retentionPauseBlockReason(user);
  assert.strictEqual(reason, null, "undefined retentionOffersConsumed should not block");
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

function run() {
  testComputeResumeAtNextBoundary();
  testComputeResumeAtReturnValue();
  testComputeResumeAtClampsShortMonth();
  testBlockReasonPastDue();
  testBlockReasonAlreadyConsumed();
  testBlockReasonNoSubscription();
  testBlockReasonEligibleUser();
  testBlockReasonScheduledToCancel();
  testBlockReasonPastDueTakesPriority();
  testBlockReasonUndefinedConsumedFlag();
  console.log("PASS RetentionPauseService");
}

run();
