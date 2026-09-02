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
    selectGateUser,
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

  // --- selectGateUser: WHICH user the gate judges ---
  //
  // The gate's decision logic was never wrong. Its INPUT was. `useMembershipModal` kept
  // `userData` in a ref refreshed every render, and the past-due tier switch on
  // /my-account/membership calls `openModal(plan)` in the MICROTASK continuation after
  // `await invalidateQueries(users.detail)` — before React Query's macrotask notification,
  // and so before any render. The ref therefore still said `past_due` for a member the
  // server had already set to `canceled`, and the gate correctly blocked a status that was
  // no longer true, stranding them on a payment sheet for a voided subscription.
  //
  // The query CACHE is written synchronously before that await resolves, so it is current
  // where the ref is not. These cases pin the selection, not the decision.

  const STALE_PAST_DUE = { _id: "u1", subscription: { status: "past_due" } };
  const FRESH_CANCELED = { _id: "u1", subscription: { status: "canceled" } };

  await test("THE BUG: fresh cache beats a stale past_due ref, so the switched member is not blocked", () => {
    const user = selectGateUser(FRESH_CANCELED, STALE_PAST_DUE);
    assert.equal(user?.subscription?.status, "canceled");
    // End-to-end through the real gate: this is the redirect that stranded them.
    const gate = resolveSubscriptionCreationGate(user, sub);
    assert.equal(gate.allowed, true, "a canceled member must be able to subscribe to the new tier");
    // And prove the old input is what failed, so this test cannot pass for the wrong reason.
    const oldBehaviour = resolveSubscriptionCreationGate(STALE_PAST_DUE, sub);
    assert.equal(oldBehaviour.allowed, false);
    if (oldBehaviour.allowed === false) {
      assert.equal(oldBehaviour.redirectTo, MANAGE_PAYMENT_PATH);
    }
  });

  await test("cache MISS falls back to the rendered user — never to a blocking default", () => {
    // A miss must not invent state. It hands the gate exactly what the old code used, so a
    // miss can only ever be as good as before, never worse.
    assert.equal(selectGateUser(undefined, STALE_PAST_DUE)?.subscription?.status, "past_due");
    assert.equal(selectGateUser(null, FRESH_CANCELED)?.subscription?.status, "canceled");
    // Guest: nothing anywhere → allowed. The expensive regression stays closed.
    assert.equal(selectGateUser(undefined, null), null);
    assert.equal(resolveSubscriptionCreationGate(selectGateUser(undefined, null), sub).allowed, true);
    assert.equal(resolveSubscriptionCreationGate(selectGateUser(undefined, undefined), sub).allowed, true);
  });

  await test("a cached user whose subscription the server CLEARED is used, not discarded", () => {
    // The teardown can leave the payload with no `subscription` at all. That is a valid,
    // non-blocking user — falling back to the stale blocking ref here would re-open the bug.
    const cleared = { _id: "u1" };
    assert.deepEqual(selectGateUser(cleared, STALE_PAST_DUE), cleared);
    assert.equal(resolveSubscriptionCreationGate(selectGateUser(cleared, STALE_PAST_DUE), sub).allowed, true);
    assert.deepEqual(selectGateUser({ _id: "u1", subscription: undefined }, STALE_PAST_DUE), {
      _id: "u1",
      subscription: undefined,
    });
  });

  await test("a malformed cache entry degrades to the fallback instead of being read as a status", () => {
    // getQueryData is typed `unknown` for a reason. Nothing here may throw, and nothing may
    // be asserted into the gate as a status it would then act on.
    for (const garbage of ["past_due", 42, true, Symbol("x"), () => {}]) {
      assert.deepEqual(selectGateUser(garbage, FRESH_CANCELED), FRESH_CANCELED, String(garbage.toString()));
    }
    assert.deepEqual(selectGateUser({ subscription: "past_due" }, FRESH_CANCELED), FRESH_CANCELED);
    assert.deepEqual(selectGateUser({ subscription: { status: 42 } }, FRESH_CANCELED), FRESH_CANCELED);
    // Rejected shapes fall back — they must not become a blocking status of their own.
    assert.equal(resolveSubscriptionCreationGate(selectGateUser({ subscription: 1 }, null), sub).allowed, true);
  });

  await test("selection is inert for every non-recovery case — it changes the input, never the answer", () => {
    // Same value on both sides: the gate's verdict must be identical to reading either one.
    for (const status of [...BLOCKING_SUBSCRIPTION_STATUSES, "canceled", "expired"]) {
      const user = { subscription: { status } };
      assert.deepEqual(
        resolveSubscriptionCreationGate(selectGateUser(user, user), sub),
        resolveSubscriptionCreationGate(user, sub),
        `${status}: selection must not alter the decision`
      );
    }
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
