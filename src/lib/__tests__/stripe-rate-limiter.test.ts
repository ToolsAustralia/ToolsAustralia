import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import Stripe from "stripe";
import {
  createRateLimiter,
  createRateLimitedHttpClient,
  endpointKeyFromPath,
  resolveLimiterConfig,
  type RateLimiter,
} from "../stripe-rate-limiter";

/**
 * Two halves:
 *   1. The limiter itself -- that it actually throttles, at the right rate, per bucket,
 *      without deadlocking or leaving a timer behind.
 *   2. TRANSPARENCY. `src/lib/stripe.ts` exports one `stripe` singleton that every
 *      payment in the app runs through, so the shim is only acceptable if it changes
 *      nothing but timing. These drive the REAL Stripe SDK through the shim against a
 *      fake inner HTTP client and assert on nested namespaces, per-call options,
 *      auto-pagination, error classes and the synchronous webhook helper.
 */

// --- fake HTTP transport --------------------------------------------------------

type StripeHttpClient = NonNullable<Stripe.StripeConfig["httpClient"]>;

interface SeenRequest {
  path: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
}

interface FakeReply {
  status: number;
  json: unknown;
  headers?: Record<string, string>;
}

/** Minimal Stripe.HttpClient whose replies are scripted per call. */
function fakeHttpClient(replies: FakeReply[]): { client: StripeHttpClient; seen: SeenRequest[] } {
  const seen: SeenRequest[] = [];
  let index = 0;
  const client = {
    getClientName: () => "fake-test-client",
    makeRequest: async (
      _host: string,
      _port: string | number,
      path: string,
      method: string,
      headers: object,
      requestData: string | null
    ) => {
      seen.push({
        path,
        method,
        headers: headers as Record<string, string>,
        body: requestData,
      });
      const reply = replies[Math.min(index, replies.length - 1)];
      index += 1;
      const responseHeaders = { "request-id": "req_fake_1", ...(reply.headers ?? {}) };
      return {
        getStatusCode: () => reply.status,
        getHeaders: () => responseHeaders,
        getRawResponse: () => reply.json,
        toStream: () => {
          throw new Error("not used");
        },
        toJSON: async () => reply.json as object,
      };
    },
  };
  return { client: client as unknown as StripeHttpClient, seen };
}

/** A Stripe client identical to the app's, except its transport is scripted. */
function stripeWithFakeTransport(replies: FakeReply[], limiter: RateLimiter) {
  const { client, seen } = fakeHttpClient(replies);
  const stripe = new Stripe("sk_test_fake_key_for_unit_tests", {
    apiVersion: "2025-08-27.basil",
    typescript: true,
    maxNetworkRetries: 0,
    httpClient: createRateLimitedHttpClient(client, limiter),
  });
  return { stripe, seen };
}

const unlimited = () => createRateLimiter({ globalPerSecond: 0, perEndpointPerSecond: 0 });

async function run() {
  // =============================================================================
  // 1. The limiter throttles
  // =============================================================================

  // The brief's acceptance case: 2 requests/sec globally, so the third must wait.
  {
    const limiter = createRateLimiter({ globalPerSecond: 2, perEndpointPerSecond: 2 });
    const t0 = Date.now();
    await limiter.acquire("/v1/subscriptions");
    await limiter.acquire("/v1/subscriptions");
    await limiter.acquire("/v1/subscriptions");
    const elapsed = Date.now() - t0;
    assert.ok(elapsed >= 400, `third acquire waited (elapsed ${elapsed}ms)`);
    assert.equal(limiter.stats().throttledCount, 1, "exactly one acquire was throttled");
    assert.equal(limiter.stats().queued, 0, "queue drained");
    assert.equal(limiter.stats().timerPending, false, "no timer left pending");
  }

  // Negative control: the same three acquires with the limiter disabled must NOT wait.
  // Without this, the assertion above would pass on a limiter that did nothing at all.
  {
    const limiter = unlimited();
    const t0 = Date.now();
    await limiter.acquire("/v1/subscriptions");
    await limiter.acquire("/v1/subscriptions");
    await limiter.acquire("/v1/subscriptions");
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 100, `disabled limiter does not throttle (elapsed ${elapsed}ms)`);
  }

  // The per-endpoint bucket is genuinely separate from the global one.
  {
    const limiter = createRateLimiter({ globalPerSecond: 100, perEndpointPerSecond: 2 });
    await limiter.acquire("/v1/payment_intents");
    await limiter.acquire("/v1/payment_intents");

    const tOther = Date.now();
    await limiter.acquire("/v1/invoices");
    assert.ok(
      Date.now() - tOther < 100,
      "a different endpoint is unaffected by another endpoint's spent tokens"
    );

    const tSame = Date.now();
    await limiter.acquire("/v1/payment_intents");
    assert.ok(Date.now() - tSame >= 400, "the third call to a 2/sec endpoint waits");
  }

  // Sustained rate, not just the opening burst: 12 acquires at 10/sec is 2 refills.
  {
    const limiter = createRateLimiter({ globalPerSecond: 10, perEndpointPerSecond: 10 });
    const t0 = Date.now();
    for (let i = 0; i < 12; i++) await limiter.acquire("/v1/invoices");
    const elapsed = Date.now() - t0;
    assert.ok(elapsed >= 150, `rate is sustained past the initial burst (elapsed ${elapsed}ms)`);
    assert.ok(elapsed < 2000, `and is not pathologically slow (elapsed ${elapsed}ms)`);
  }

  // Concurrent acquires: everything resolves, in FIFO order, with no deadlock and no
  // orphaned timer. This is the "20 webhook events x 7 calls" shape in miniature.
  {
    const limiter = createRateLimiter({ globalPerSecond: 5, perEndpointPerSecond: 5 });
    const order: number[] = [];
    const t0 = Date.now();
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        limiter.acquire("/v1/subscriptions").then(() => {
          order.push(i);
        })
      )
    );
    const elapsed = Date.now() - t0;
    assert.deepEqual(order, [0, 1, 2, 3, 4, 5, 6, 7], "concurrent acquires resolve FIFO");
    assert.ok(elapsed >= 400, `the 6th-8th concurrent acquires were metered (${elapsed}ms)`);
    assert.ok(elapsed < 4000, `and completed promptly (${elapsed}ms)`);
    assert.equal(limiter.stats().queued, 0, "nothing left queued");
    assert.equal(limiter.stats().timerPending, false, "no timer leaked after the queue drained");
  }

  // A rate below 1/sec must still make progress rather than deadlock on a bucket that
  // can never hold a whole token.
  {
    const limiter = createRateLimiter({ globalPerSecond: 0.5, perEndpointPerSecond: 0.5 });
    await limiter.acquire("/v1/invoices"); // capacity is floored at 1, so this is free
    assert.equal(limiter.stats().queued, 0, "sub-1/sec rate does not deadlock");
  }

  // =============================================================================
  // 2. Endpoint keys and config
  // =============================================================================

  assert.equal(endpointKeyFromPath("/v1/subscriptions/sub_123"), "/v1/subscriptions");
  assert.equal(endpointKeyFromPath("/v1/invoices"), "/v1/invoices");
  assert.equal(
    endpointKeyFromPath("/v1/invoices?limit=100&status=paid"),
    "/v1/invoices",
    "query string is stripped (the SDK appends it to the path)"
  );
  assert.equal(endpointKeyFromPath("/v1/payment_intents/pi_1/confirm"), "/v1/payment_intents");
  assert.equal(endpointKeyFromPath("/v2/core/events/evt_1"), "/v2/core/events", "v2 nests deeper");
  assert.equal(endpointKeyFromPath("/"), "/");

  {
    const live = resolveLimiterConfig({ STRIPE_SECRET_KEY: "sk_live_abc" });
    assert.equal(live.sandbox, false);
    assert.equal(live.globalPerSecond, 80, "live default is 80% of Stripe's 100/sec global cap");
    assert.equal(live.perEndpointPerSecond, 20, "endpoint default is 80% of the 25/sec cap");

    const sandbox = resolveLimiterConfig({ STRIPE_SECRET_KEY: "sk_test_abc" });
    assert.equal(sandbox.sandbox, true);
    assert.equal(sandbox.globalPerSecond, 20, "sandbox default is 80% of its 25/sec global cap");

    const overridden = resolveLimiterConfig({
      STRIPE_SECRET_KEY: "sk_live_abc",
      STRIPE_RATE_LIMIT_GLOBAL_PER_SECOND: "40",
      STRIPE_RATE_LIMIT_ENDPOINT_PER_SECOND: "0",
    });
    assert.equal(overridden.globalPerSecond, 40, "env override wins");
    assert.equal(overridden.perEndpointPerSecond, 0, "an explicit 0 disables that bucket");

    const garbage = resolveLimiterConfig({
      STRIPE_SECRET_KEY: "sk_live_abc",
      STRIPE_RATE_LIMIT_GLOBAL_PER_SECOND: "not-a-number",
    });
    assert.equal(garbage.globalPerSecond, 80, "garbage falls back to the default, never to 0");
  }

  // =============================================================================
  // 3. TRANSPARENCY of the HTTP shim
  // =============================================================================

  // getClientName is delegated, so the SDK's user-agent string is unchanged.
  {
    const { client } = fakeHttpClient([{ status: 200, json: {} }]);
    assert.equal(
      createRateLimitedHttpClient(client, unlimited()).getClientName(),
      "fake-test-client",
      "getClientName is delegated, not replaced"
    );
  }

  // THE WIRING. Everything else either calls limiter.acquire() directly or runs the SDK
  // through a limiter that never throttles -- delete the `await limiter.acquire(...)` line
  // in the shim and all of it still passes. This is the case that fails if the shim stops
  // consulting the limiter, and it also pins that the key reaching acquire() is the
  // COLLAPSED endpoint key: sub_1 and sub_2 are different paths but must share one bucket.
  {
    const limiter = createRateLimiter({ globalPerSecond: 1, perEndpointPerSecond: 1 });
    const { stripe, seen } = stripeWithFakeTransport(
      [
        { status: 200, json: { id: "sub_1", object: "subscription" } },
        { status: 200, json: { id: "sub_2", object: "subscription" } },
      ],
      limiter
    );
    await stripe.subscriptions.retrieve("sub_1");
    const t0 = Date.now();
    await stripe.subscriptions.retrieve("sub_2");
    const elapsed = Date.now() - t0;
    assert.ok(elapsed >= 400, `the SDK call itself was throttled by the shim (${elapsed}ms)`);
    assert.equal(limiter.stats().throttledCount, 1, "the shim consulted the limiter");
    assert.deepEqual(
      seen.map((r) => r.path),
      ["/v1/subscriptions/sub_1", "/v1/subscriptions/sub_2"],
      "two distinct instance paths..."
    );
    assert.equal(
      endpointKeyFromPath(seen[0].path),
      endpointKeyFromPath(seen[1].path),
      "...collapsed to one shared endpoint bucket"
    );
  }

  // A plain resource call still returns a parsed Stripe object, and is metered under
  // the resource's endpoint key rather than the full instance path.
  {
    const limiter = createRateLimiter({ globalPerSecond: 100, perEndpointPerSecond: 100 });
    const { stripe, seen } = stripeWithFakeTransport(
      [{ status: 200, json: { id: "sub_123", object: "subscription", status: "active" } }],
      limiter
    );
    const sub = await stripe.subscriptions.retrieve("sub_123");
    assert.equal(sub.id, "sub_123", "response is the SDK's parsed object, untouched");
    assert.equal(sub.lastResponse.requestId, "req_fake_1", "lastResponse plumbing survives");
    assert.equal(seen[0].path, "/v1/subscriptions/sub_123");
    assert.equal(
      endpointKeyFromPath(seen[0].path),
      "/v1/subscriptions",
      "instance paths collapse to one endpoint bucket"
    );
  }

  // Three-deep namespace (stripe.testHelpers.testClocks.retrieve) still resolves.
  {
    const { stripe, seen } = stripeWithFakeTransport(
      [{ status: 200, json: { id: "clock_1", object: "test_helpers.test_clock" } }],
      unlimited()
    );
    const clock = await stripe.testHelpers.testClocks.retrieve("clock_1");
    assert.equal(clock.id, "clock_1", "nested namespace call works through the shim");
    assert.equal(seen[0].path, "/v1/test_helpers/test_clocks/clock_1");
  }

  // The per-call options object survives. Several call sites pass `{ idempotencyKey }`
  // as a 2nd/3rd argument; losing it would let a retry double-charge a member.
  {
    const { stripe, seen } = stripeWithFakeTransport(
      [{ status: 200, json: { id: "pi_1", object: "payment_intent", amount: 2000 } }],
      unlimited()
    );
    await stripe.paymentIntents.create(
      { amount: 2000, currency: "aud" },
      { idempotencyKey: "pi_key_abc" }
    );
    assert.equal(
      seen[0].headers["Idempotency-Key"],
      "pi_key_abc",
      "the per-call options object reaches the transport as a header"
    );
    assert.equal(seen[0].method, "POST");
    assert.ok(seen[0].body?.includes("amount=2000"), "the request body is unchanged");
  }

  // Auto-pagination. `.list()` / `.search()` return an ApiListPromise -- a promise that
  // is ALSO an async iterator -- and six call sites drive it with `for await`. An async
  // wrapper around the resource method would return a plain Promise and break this;
  // wrapping the transport instead cannot. Page 2 is metered too.
  {
    const limiter = createRateLimiter({ globalPerSecond: 100, perEndpointPerSecond: 100 });
    const { stripe, seen } = stripeWithFakeTransport(
      [
        {
          status: 200,
          json: {
            object: "list",
            url: "/v1/customers",
            has_more: true,
            data: [{ id: "cus_1", object: "customer" }],
          },
        },
        {
          status: 200,
          json: {
            object: "list",
            url: "/v1/customers",
            has_more: false,
            data: [{ id: "cus_2", object: "customer" }],
          },
        },
      ],
      limiter
    );
    const ids: string[] = [];
    for await (const customer of stripe.customers.list({ limit: 1 })) {
      ids.push(customer.id);
    }
    assert.deepEqual(ids, ["cus_1", "cus_2"], "for await auto-pagination still works");
    assert.equal(seen.length, 2, "the follow-up page was fetched");
    assert.ok(
      seen[1].path.includes("starting_after=cus_1"),
      "and it was the SDK's own paging request, unmodified"
    );
  }

  // Error propagation. Call sites classify on the concrete error class, `code`,
  // `decline_code` and `statusCode`; a shim that caught or rewrapped would break every
  // one of them.
  {
    const { stripe } = stripeWithFakeTransport(
      [
        {
          status: 400,
          json: {
            error: {
              type: "invalid_request_error",
              code: "payment_intent_unexpected_state",
              message: "PaymentIntent is in an unexpected state.",
            },
          },
        },
      ],
      unlimited()
    );
    await assert.rejects(
      () => stripe.paymentIntents.confirm("pi_1"),
      (err: unknown) => {
        assert.ok(
          err instanceof Stripe.errors.StripeInvalidRequestError,
          "400 still yields StripeInvalidRequestError"
        );
        assert.equal(err.code, "payment_intent_unexpected_state", "error code preserved");
        assert.equal(err.statusCode, 400, "status code preserved");
        assert.equal(err.requestId, "req_fake_1", "request id preserved");
        return true;
      }
    );
  }

  {
    const { stripe } = stripeWithFakeTransport(
      [
        {
          status: 402,
          json: {
            error: {
              type: "card_error",
              code: "card_declined",
              decline_code: "insufficient_funds",
              message: "Your card has insufficient funds.",
            },
          },
        },
      ],
      unlimited()
    );
    await assert.rejects(
      () => stripe.invoices.pay("in_1"),
      (err: unknown) => {
        assert.ok(err instanceof Stripe.errors.StripeCardError, "402 still yields StripeCardError");
        assert.equal(err.decline_code, "insufficient_funds", "decline_code preserved");
        return true;
      }
    );
  }

  // A real 429 must still surface as StripeRateLimitError -- the limiter reduces how
  // often we see one, it must not hide one.
  {
    const { stripe } = stripeWithFakeTransport(
      [{ status: 429, json: { error: { type: "rate_limit_error", message: "Too many requests." } } }],
      unlimited()
    );
    await assert.rejects(
      () => stripe.subscriptions.retrieve("sub_1"),
      (err: unknown) => {
        assert.ok(
          err instanceof Stripe.errors.StripeRateLimitError,
          "429 still yields StripeRateLimitError, not a wrapped error"
        );
        return true;
      }
    );
  }

  // stripe.webhooks.constructEvent is SYNCHRONOUS and never touches the transport.
  // Awaiting or promisifying it would break /api/stripe/webhook at line 36.
  {
    const { stripe } = stripeWithFakeTransport([{ status: 200, json: {} }], unlimited());
    const secret = "whsec_test_secret";
    const payload = JSON.stringify({ id: "evt_1", object: "event", type: "invoice.paid" });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
    const event = stripe.webhooks.constructEvent(payload, `t=${timestamp},v1=${signature}`, secret);
    assert.equal(
      typeof (event as unknown as { then?: unknown }).then,
      "undefined",
      "constructEvent returns an event synchronously, not a promise"
    );
    assert.equal(event.id, "evt_1", "the webhook event is constructed correctly");
  }

  console.log("stripe-rate-limiter tests passed");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
