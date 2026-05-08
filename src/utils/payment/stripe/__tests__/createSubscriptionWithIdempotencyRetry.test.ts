import assert from "node:assert/strict";
import Stripe from "stripe";
import { createSubscriptionWithIdempotencyRetry } from "../createSubscriptionWithIdempotencyRetry";

type Call =
  | { method: "create"; payload: Stripe.SubscriptionCreateParams; opts: { idempotencyKey?: string } }
  | { method: "list"; params: Stripe.SubscriptionListParams }
  | { method: "cancel"; id: string };

function makeIdempotencyError(): Error {
  const err: Error = new Error(
    "Keys for idempotent requests can only be used with the same parameters they were first used with."
  );
  Object.setPrototypeOf(err, Stripe.errors.StripeIdempotencyError.prototype);
  return err;
}

function makeMockStripe(behavior: {
  firstCreateThrowsIdempotency?: boolean;
  firstCreateThrowsOther?: Error;
  listReturns?: Array<{ id: string; metadata?: Record<string, string> }>;
  listThrows?: Error;
}): { stripe: Stripe; calls: Call[] } {
  const calls: Call[] = [];
  let createCount = 0;
  const stripe = {
    subscriptions: {
      async create(payload: Stripe.SubscriptionCreateParams, opts: { idempotencyKey?: string }) {
        calls.push({ method: "create", payload, opts });
        createCount++;
        if (createCount === 1 && behavior.firstCreateThrowsIdempotency) throw makeIdempotencyError();
        if (createCount === 1 && behavior.firstCreateThrowsOther) throw behavior.firstCreateThrowsOther;
        return { id: `sub_${createCount}`, status: "incomplete" } as Stripe.Subscription;
      },
      async list(params: Stripe.SubscriptionListParams) {
        calls.push({ method: "list", params });
        if (behavior.listThrows) throw behavior.listThrows;
        return { data: behavior.listReturns ?? [] } as Stripe.ApiList<Stripe.Subscription>;
      },
      async cancel(id: string) {
        calls.push({ method: "cancel", id });
        return { id, status: "canceled" } as Stripe.Subscription;
      },
    },
  } as unknown as Stripe;
  return { stripe, calls };
}

const basePayload: Stripe.SubscriptionCreateParams = {
  customer: "cus_1",
  items: [{ price: "price_1" }],
};

async function testHappyPathSingleCreateCall() {
  const { stripe, calls } = makeMockStripe({});
  const sub = await createSubscriptionWithIdempotencyRetry({
    stripe,
    payload: basePayload,
    idempotencyKey: "uuid-original",
    customerId: "cus_1",
    packageId: "pkg_1",
  });
  assert.equal(sub.id, "sub_1");
  assert.equal(calls.filter((c) => c.method === "create").length, 1);
  assert.equal(calls.filter((c) => c.method === "list").length, 0);
  assert.equal(calls.filter((c) => c.method === "cancel").length, 0);
}

async function testRetriesAfterIdempotencyErrorAndCancelsOrphan() {
  const { stripe, calls } = makeMockStripe({
    firstCreateThrowsIdempotency: true,
    listReturns: [
      { id: "sub_orphan_other", metadata: { packageId: "pkg_OTHER" } },
      { id: "sub_orphan_match", metadata: { packageId: "pkg_1" } },
    ],
  });

  const sub = await createSubscriptionWithIdempotencyRetry({
    stripe,
    payload: basePayload,
    idempotencyKey: "uuid-original",
    customerId: "cus_1",
    packageId: "pkg_1",
  });

  assert.equal(sub.id, "sub_2", "retry result should be returned");

  const createCalls = calls.filter((c): c is Extract<Call, { method: "create" }> => c.method === "create");
  assert.equal(createCalls.length, 2);
  assert.equal(createCalls[0].opts.idempotencyKey, "uuid-original");
  assert.notEqual(createCalls[1].opts.idempotencyKey, "uuid-original");
  assert.match(createCalls[1].opts.idempotencyKey ?? "", /^[0-9a-f-]{36}$/i);

  const cancelCalls = calls.filter((c): c is Extract<Call, { method: "cancel" }> => c.method === "cancel");
  assert.equal(cancelCalls.length, 1);
  assert.equal(cancelCalls[0].id, "sub_orphan_match", "should cancel only the orphan matching this packageId");
}

async function testRetrySucceedsEvenWhenOrphanCancelFails() {
  const { stripe, calls } = makeMockStripe({
    firstCreateThrowsIdempotency: true,
    listThrows: new Error("list failed"),
  });

  const sub = await createSubscriptionWithIdempotencyRetry({
    stripe,
    payload: basePayload,
    idempotencyKey: "uuid-original",
    customerId: "cus_1",
    packageId: "pkg_1",
  });

  assert.equal(sub.id, "sub_2");
  assert.equal(calls.filter((c) => c.method === "create").length, 2);
}

async function testRetrySkipsCancelWhenNoMatchingOrphan() {
  const { stripe, calls } = makeMockStripe({
    firstCreateThrowsIdempotency: true,
    listReturns: [{ id: "sub_other", metadata: { packageId: "pkg_OTHER" } }],
  });

  await createSubscriptionWithIdempotencyRetry({
    stripe,
    payload: basePayload,
    idempotencyKey: "uuid-original",
    customerId: "cus_1",
    packageId: "pkg_1",
  });

  assert.equal(calls.filter((c) => c.method === "cancel").length, 0);
}

async function testNonIdempotencyErrorRethrownWithoutRetry() {
  const { stripe, calls } = makeMockStripe({
    firstCreateThrowsOther: new Error("card_declined"),
  });

  await assert.rejects(
    () =>
      createSubscriptionWithIdempotencyRetry({
        stripe,
        payload: basePayload,
        idempotencyKey: "uuid-original",
        customerId: "cus_1",
        packageId: "pkg_1",
      }),
    /card_declined/
  );

  assert.equal(calls.filter((c) => c.method === "create").length, 1);
  assert.equal(calls.filter((c) => c.method === "cancel").length, 0);
}

async function run() {
  await testHappyPathSingleCreateCall();
  await testRetriesAfterIdempotencyErrorAndCancelsOrphan();
  await testRetrySucceedsEvenWhenOrphanCancelFails();
  await testRetrySkipsCancelWhenNoMatchingOrphan();
  await testNonIdempotencyErrorRethrownWithoutRetry();
  console.log("createSubscriptionWithIdempotencyRetry tests passed");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
