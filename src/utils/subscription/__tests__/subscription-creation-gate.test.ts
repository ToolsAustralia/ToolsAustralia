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

  // --- must block ---
  await test("every BLOCKING_SUBSCRIPTION_STATUSES value blocks a subscription open", () => {
    for (const status of BLOCKING_SUBSCRIPTION_STATUSES) {
      const r = resolveSubscriptionCreationGate({ subscription: { status } }, sub);
      assert.equal(r.allowed, false, `${status} must block`);
    }
  });

  await test("past_due routes to the payment sheet, other blocking to the plan sheet", () => {
    const pastDue = resolveSubscriptionCreationGate({ subscription: { status: "past_due" } }, sub);
    assert.equal(pastDue.allowed, false);
    if (pastDue.allowed === false) {
      assert.equal(pastDue.reason, "past_due");
      assert.equal(pastDue.redirectTo, MANAGE_PAYMENT_PATH);
    }
    const active = resolveSubscriptionCreationGate({ subscription: { status: "active" } }, sub);
    assert.equal(active.allowed, false);
    if (active.allowed === false) {
      assert.equal(active.reason, "blocking");
      assert.equal(active.redirectTo, MANAGE_SUBSCRIPTION_PATH);
    }
  });

  // --- isSubscriptionPlan ---
  await test("isSubscriptionPlan matches the two inlined copies it replaces", () => {
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
