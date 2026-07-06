import assert from "node:assert/strict";
import {
  computeResumeAt,
  retentionPauseBlockReason,
  RETENTION_PAUSE_DAYS,
} from "../RetentionPauseService";

// ---------------------------------------------------------------------------
// computeResumeAt
// ---------------------------------------------------------------------------

function testComputeResumeAtMath() {
  const now = new Date("2026-05-18T12:00:00.000Z");
  const expected = Math.floor((now.getTime() + RETENTION_PAUSE_DAYS * 86_400_000) / 1000);
  const actual = computeResumeAt(now);
  assert.strictEqual(actual, expected);
  // Spot-check: 30 days = 2592000 seconds
  assert.strictEqual(actual - Math.floor(now.getTime() / 1000), 30 * 86_400);
}

function testComputeResumeAtReturnValue() {
  // Given a known input, verify the returned value is a Unix second (integer)
  const now = new Date("2026-01-01T00:00:00.000Z");
  const result = computeResumeAt(now);
  assert.ok(Number.isInteger(result), "result must be an integer (unix seconds)");
  // 2026-01-01 + 30 days = 2026-01-31T00:00:00.000Z
  const expected = new Date("2026-01-31T00:00:00.000Z").getTime() / 1000;
  assert.strictEqual(result, expected);
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
  testComputeResumeAtMath();
  testComputeResumeAtReturnValue();
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
