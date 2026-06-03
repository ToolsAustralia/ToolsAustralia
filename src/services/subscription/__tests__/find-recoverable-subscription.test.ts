import assert from "node:assert/strict";
import type Stripe from "stripe";
// Type-only import: erased at runtime so the eager `new Stripe()` inside
// @/lib/stripe (imported by SubscriptionReferenceService) does NOT run here.
import type * as SubRefService from "../SubscriptionReferenceService";

type StripeClientArg = Parameters<typeof SubRefService.findRecoverableSubscriptionForCustomer>[1];

function makeSub(id: string, status: string, created = 1000): Stripe.Subscription {
  return { id, status, created } as unknown as Stripe.Subscription;
}

/**
 * Mock Stripe whose subscriptions.list returns data keyed by the requested
 * `status` filter. This reproduces the real Stripe quirk: a subscription with a
 * future `trial_end` but `payment_behavior: default_incomplete` and an unpaid
 * initial invoice has object `.status === "incomplete"`, yet Stripe returns it
 * from `list({ status: "trialing" })`. See docs/subscription/gotchas.md.
 */
function mockStripe(byStatusFilter: Record<string, Stripe.Subscription[]>): StripeClientArg {
  return {
    subscriptions: {
      list: async (params: { status?: string }) => ({
        data: byStatusFilter[params.status ?? "all"] ?? [],
      }),
    },
  } as unknown as StripeClientArg;
}

/**
 * THE BUG: an abandoned, unpaid checkout (object .status === "incomplete") is
 * leaked by Stripe's `status: "trialing"` filter. The guard must NOT treat it as
 * a live membership, otherwise the user is permanently blocked from resubscribing.
 */
async function testIncompleteLeakedByTrialingFilterIsNotRecoverable(svc: typeof SubRefService) {
  const stripe = mockStripe({ trialing: [makeSub("sub_incomplete_trial", "incomplete")] });

  const recovered = await svc.findRecoverableSubscriptionForCustomer("cus_x", stripe);
  assert.equal(recovered, null, "incomplete sub leaked by trialing filter must not be recoverable");

  const blocks = await svc.stripeCustomerHasManageableSubscription("cus_x", stripe);
  assert.equal(
    blocks,
    false,
    "must not block resubscribe when the customer only has an incomplete sub"
  );
}

async function testGenuineTrialingIsRecoverable(svc: typeof SubRefService) {
  const stripe = mockStripe({ trialing: [makeSub("sub_real_trial", "trialing")] });
  const recovered = await svc.findRecoverableSubscriptionForCustomer("cus_x", stripe);
  assert.equal(recovered?.id, "sub_real_trial", "genuine trialing sub is recoverable");
  assert.equal(
    await svc.stripeCustomerHasManageableSubscription("cus_x", stripe),
    true,
    "genuine trialing sub blocks a new subscription"
  );
}

async function testGenuinePastDueIsRecoverable(svc: typeof SubRefService) {
  const stripe = mockStripe({ past_due: [makeSub("sub_pd", "past_due")] });
  const recovered = await svc.findRecoverableSubscriptionForCustomer("cus_x", stripe);
  assert.equal(recovered?.id, "sub_pd", "genuine past_due sub is recoverable");
}

/**
 * The incomplete leak appears under the trialing filter, but a genuine past_due
 * sub also exists. The function must skip the leak and return the real one.
 */
async function testSkipsLeakAndFindsGenuineSub(svc: typeof SubRefService) {
  const stripe = mockStripe({
    trialing: [makeSub("sub_leak", "incomplete")],
    past_due: [makeSub("sub_real_pd", "past_due")],
  });
  const recovered = await svc.findRecoverableSubscriptionForCustomer("cus_x", stripe);
  assert.equal(
    recovered?.id,
    "sub_real_pd",
    "skips the incomplete leak and finds the genuine past_due sub"
  );
}

async function testReturnsMostRecentValidSub(svc: typeof SubRefService) {
  const stripe = mockStripe({
    trialing: [makeSub("sub_old", "trialing", 1000), makeSub("sub_new", "trialing", 2000)],
  });
  const recovered = await svc.findRecoverableSubscriptionForCustomer("cus_x", stripe);
  assert.equal(recovered?.id, "sub_new", "returns the most recently created valid sub");
}

async function run() {
  // Dummy key so the eager `new Stripe()` in @/lib/stripe does not throw. The
  // real client is never called — every test passes a mock client. tsx does not
  // load .env, so this never picks up real credentials.
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy_for_unit_tests";
  const svc = await import("../SubscriptionReferenceService");

  await testIncompleteLeakedByTrialingFilterIsNotRecoverable(svc);
  await testGenuineTrialingIsRecoverable(svc);
  await testGenuinePastDueIsRecoverable(svc);
  await testSkipsLeakAndFindsGenuineSub(svc);
  await testReturnsMostRecentValidSub(svc);
  console.log("find-recoverable-subscription tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
