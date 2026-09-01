import assert from "node:assert/strict";

/**
 * Fences resolveSubscriptionCreationGate — the single "can this user start a NEW
 * subscription?" decision, shared by the modal-open chokepoint and both card-click
 * handlers. It wraps the SAME hasBlockingSubscription the server's
 * checkCanCreateSubscription uses, so client and server can never disagree.
 *
 * The must-NOT-block cases matter most: a false block stops a guest subscribing,
 * which is a worse regression than the bug this closes (spec §1).
 *
 * Run: npm run test:subscription-gate
 */

let failures = 0;
const test = (name: string, fn: () => void | Promise<void>) => {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`✓ ${name}`))
    .catch((e: Error) => {
      failures++;
      console.error(`✗ ${name}\n  ${e.message}`);
    });
};

async function main() {
  const {
    resolveSubscriptionCreationGate,
    isSubscriptionPlan,
    MANAGE_PAYMENT_PATH,
    MANAGE_SUBSCRIPTION_PATH,
  } = await import("@/utils/subscription/subscription-creation-gate");
  const { BLOCKING_SUBSCRIPTION_STATUSES } = await import(
    "@/utils/subscription/subscription-helpers"
  );

  const sub = { isSubscriptionPlan: true, userLoading: false };

  // --- must NOT block (the expensive regression) ---
  await test("guest / no user → allowed", () => {
    assert.equal(resolveSubscriptionCreationGate(null, sub).allowed, true);
    assert.equal(resolveSubscriptionCreationGate(undefined, sub).allowed, true);
    assert.equal(resolveSubscriptionCreationGate({}, sub).allowed, true);
  });

  await test("terminal statuses → allowed (they must be able to resubscribe)", () => {
    for (const status of ["canceled", "cancelled", "incomplete", "incomplete_expired", "expired"]) {
      assert.equal(
        resolveSubscriptionCreationGate({ subscription: { status } }, sub).allowed,
        true,
        `${status} must not be blocked`
      );
    }
  });

  await test("pack (non-subscription) → allowed for EVERY blocking status", () => {
    for (const status of BLOCKING_SUBSCRIPTION_STATUSES) {
      assert.equal(
        resolveSubscriptionCreationGate(
          { subscription: { status } },
          { isSubscriptionPlan: false, userLoading: false }
        ).allowed,
        true,
        `${status} must still be able to buy a pack`
      );
    }
  });

  await test("user data still loading → allowed even when blocking", () => {
    assert.equal(
      resolveSubscriptionCreationGate(
        { subscription: { status: "active" } },
        { isSubscriptionPlan: true, userLoading: true }
      ).allowed,
      true
    );
  });

  // --- must block, AND land on the right sheet ---
  //
  // `.allowed === false` alone is not enough. `unpaid` blocked correctly for weeks while
  // being sent to the CHANGE-TIER sheet, which cannot take a recovering member's money —
  // the assertion never looked at where they landed, so nothing failed. Every blocking
  // status therefore declares its expected reason AND destination by name.
  //
  // Iterate the EXPORTED constant, not a copy: a newly added blocking status has no entry
  // here and fails this test until someone decides where it should route.
  const EXPECTED_BLOCK: Record<string, { reason: string; redirectTo: string }> = {
    // In payment recovery → the payment sheet. They came to pay us.
    past_due: { reason: "recovery", redirectTo: MANAGE_PAYMENT_PATH },
    unpaid: { reason: "recovery", redirectTo: MANAGE_PAYMENT_PATH },
    // Holding a live subscription → the plan sheet (change tier / cancel).
    active: { reason: "blocking", redirectTo: MANAGE_SUBSCRIPTION_PATH },
    trialing: { reason: "blocking", redirectTo: MANAGE_SUBSCRIPTION_PATH },
    paused: { reason: "blocking", redirectTo: MANAGE_SUBSCRIPTION_PATH },
  };

  await test("every BLOCKING_SUBSCRIPTION_STATUSES value blocks AND routes to the named sheet", () => {
    for (const status of BLOCKING_SUBSCRIPTION_STATUSES) {
      const expected = EXPECTED_BLOCK[status];
      assert.ok(
        expected,
        `${status} is a blocking status with no expected reason/redirect declared — add it to EXPECTED_BLOCK and make sure the gate routes it somewhere that can actually help that member`
      );
      const r = resolveSubscriptionCreationGate({ subscription: { status } }, sub);
      assert.equal(r.allowed, false, `${status} must block`);
      if (r.allowed === false) {
        assert.equal(r.reason, expected.reason, `${status} reason`);
        assert.equal(r.redirectTo, expected.redirectTo, `${status} redirectTo`);
      }
    }
  });

  await test("the two payment-sheet statuses are exactly the shared recovery pair", async () => {
    // The gate must not restate the status list — it delegates to the one predicate that
    // already owns "in payment recovery" repo-wide. If that pair changes, this fails.
    const { isSubscriptionRecoveryStatus } = await import(
      "@/utils/integrations/klaviyo/klaviyo-renewal-entries-preview"
    );
    for (const status of BLOCKING_SUBSCRIPTION_STATUSES) {
      const r = resolveSubscriptionCreationGate({ subscription: { status } }, sub);
      const goesToPayment = r.allowed === false && r.redirectTo === MANAGE_PAYMENT_PATH;
      assert.equal(
        goesToPayment,
        isSubscriptionRecoveryStatus(status),
        `${status}: payment-sheet routing must match isSubscriptionRecoveryStatus`
      );
    }
  });

  // --- isSubscriptionPlan ---
  // No inline copy of this expression survives anywhere in src/ as of 2026-09-01 — the last
  // two (MembershipSection's getPlanHierarchy + renderPlanCard) now call this helper. These
  // cases pin the behaviour those copies had, so the de-duplication stays behaviour-identical.
  await test("isSubscriptionPlan matches the inlined copies it replaced", () => {
    assert.equal(isSubscriptionPlan({ period: "mo", name: "Tradie" }), true);
    assert.equal(isSubscriptionPlan({ period: "one-time", name: "Apprentice" }), false);
    assert.equal(isSubscriptionPlan({ period: "mo", name: "One-Time Boost" }), false);
    assert.equal(isSubscriptionPlan({ period: "mo", name: "ONE-TIME PACK" }), false);
  });

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed`);
    process.exit(1);
  }
  console.log("\nAll subscription-creation-gate tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
