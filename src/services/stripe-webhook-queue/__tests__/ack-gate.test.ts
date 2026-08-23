import assert from "node:assert/strict";
import dotenv from "dotenv";
import path from "node:path";
import type Stripe from "stripe";

// Load .env.local before any import that reads env vars at module load — the stripe
// singleton throws at import time when STRIPE_SECRET_KEY is missing, so every app
// module below is imported dynamically inside run(), AFTER this line. Same convention
// as stripe-webhook-handlers/__tests__/zero-trial-invoice-guard.test.ts.
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * Regression test for the ACK GATE (incident 2026-08-23 / RC-1).
 *
 * On 24 Aug AEST, 11 members were charged $300.00 in total and received no entries.
 * Two defects combined:
 *   1. `handleInvoicePaymentSucceeded` wrapped its whole body in one try whose outer
 *      catch swallowed the error and returned normally, and the dispatcher then set
 *      `shouldMarkAsProcessed = true` unconditionally.
 *   2. `processQueuedEvent` called `markSucceeded()` on every non-throwing path.
 * Result: the queue row went to `succeeded`, a `ProcessedStripeEvent` dedup row was
 * written (which then BLOCKED a Stripe replay from healing the member), and nothing
 * was ever granted or retried.
 *
 * The four cases below pin the corrected behaviour. B is as important as A: gating on
 * `shouldMarkAsProcessed` instead of `handlerFailed` would dead-letter ~19 of the 21
 * subscribed event types, all of which legitimately leave that flag false.
 *
 * A and B drive the seam. C and D drive the REAL dispatcher + handler with only
 * `stripe.invoices.retrieve` stubbed, so they pin production wiring, not the mock.
 */

const PREFIX = `test_ack_gate_${Date.now()}`;
const TEST_CUSTOMER_ID = "cus_ack_gate_test_001";

function queueRow(eventId: string, type: string, payload: unknown) {
  return {
    eventId,
    type,
    payload,
    status: "queued",
    attempts: 0,
    nextAttemptAt: new Date(),
    claimedAt: null,
    lastError: null,
    enqueuedAt: new Date(),
    processedAt: null,
  };
}

function invoiceEvent(eventId: string, invoiceId: string): Stripe.Event {
  return {
    id: eventId,
    object: "event",
    type: "invoice.payment_succeeded",
    api_version: "2025-08-27.basil",
    created: 1756000000,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: invoiceId,
        object: "invoice",
        status: "paid",
        billing_reason: "subscription_cycle",
        total: 2000,
        amount_paid: 2000,
        customer: TEST_CUSTOMER_ID,
        lines: { data: [], has_more: false, object: "list", url: "" },
        metadata: {},
      },
    },
  } as unknown as Stripe.Event;
}

/** Stripe's $0 trial-bookkeeping invoice — a legitimate "nothing to grant". */
function zeroTrialInvoice(invoiceId: string): Stripe.Invoice {
  return {
    id: invoiceId,
    object: "invoice",
    status: "paid",
    billing_reason: "subscription_update",
    total: 0,
    amount_paid: 0,
    customer: TEST_CUSTOMER_ID,
    lines: { data: [], has_more: false, object: "list", url: "" },
    metadata: {},
  } as unknown as Stripe.Invoice;
}

async function run() {
  const { default: connectDB } = await import("@/lib/mongodb");
  const { default: StripeWebhookQueue } = await import("@/models/StripeWebhookQueue");
  const { default: ProcessedStripeEvent } = await import("@/models/ProcessedStripeEvent");
  const { stripe } = await import("@/lib/stripe");
  const { processQueuedEvent } = await import(
    "@/services/stripe-webhook-queue/processQueuedEvent"
  );

  await connectDB();

  let failures = 0;
  function expect(label: string, actual: unknown, expected: unknown) {
    try {
      assert.deepEqual(actual, expected);
      console.log(`  PASS  ${label}`);
    } catch {
      failures++;
      console.error(`  FAIL  ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    }
  }

  const originalRetrieve = stripe.invoices.retrieve;

  try {
    // ── Case A — a handler that reports the grant did NOT complete must leave the row
    //    retryable, and must NOT write the ProcessedStripeEvent dedup row.
    const idA = `${PREFIX}_a`;
    await StripeWebhookQueue.create(queueRow(idA, "invoice.payment_succeeded", invoiceEvent(idA, "in_ack_gate_a")));
    const rA = await processQueuedEvent(idA, {
      dispatch: async () => ({ shouldMarkAsProcessed: false, handlerFailed: true }),
    });

    // Proves the gate was actually REACHED. `claimNextAttempt` runs first and returns
    // null for a non-existent row, short-circuiting to `not_claimable` — an assertion
    // that only checked `processed === false` would pass without ever reaching dispatch.
    expect("A: gate reached (not short-circuited at claim)", rA.skipped, undefined);
    expect("A: reported as not processed", rA.processed, false);
    expect("A: error code is not_granted", rA.error, "not_granted");

    const rowA = await StripeWebhookQueue.findOne({ eventId: idA }).lean<{ status?: string; attempts?: number; lastError?: string } | null>();
    expect("A: row is NOT succeeded", rowA?.status === "succeeded", false);
    expect("A: row requeued for retry", rowA?.status, "queued");
    expect("A: attempts incremented", rowA?.attempts, 1);
    expect("A: lastError recorded", rowA?.lastError, "handler reported grant did not complete");

    const ackA = await ProcessedStripeEvent.countDocuments({ eventId: idA });
    expect("A: no ProcessedStripeEvent row (replay stays possible)", ackA, 0);

    // ── Case B — the ordinary non-payment event. ~19 of the 21 subscribed event types
    //    leave `shouldMarkAsProcessed` false and that is healthy success. Gating on it
    //    (rather than on handlerFailed) would dead-letter every one of them.
    const idB = `${PREFIX}_b`;
    await StripeWebhookQueue.create(queueRow(idB, "customer.updated", { id: idB, type: "customer.updated", data: { object: { id: "cus_x" } } }));
    const rB = await processQueuedEvent(idB, {
      dispatch: async () => ({ shouldMarkAsProcessed: false }),
    });
    expect("B: non-payment event still processed", rB.processed, true);
    const rowB = await StripeWebhookQueue.findOne({ eventId: idB }).lean<{ status?: string } | null>();
    expect("B: non-payment event still marked succeeded", rowB?.status, "succeeded");

    // ── Case C — END TO END through the REAL dispatcher + handler. A Stripe error
    //    inside the handler (on 2026-08-23: HTTP 429 from the renewal burst) must leave
    //    the event retryable, not `succeeded`. This is the exact production path that
    //    lost the 11 grants; only `stripe.invoices.retrieve` is stubbed.
    const idC = `${PREFIX}_c`;
    const invoiceIdC = "in_ack_gate_c";
    await StripeWebhookQueue.create(queueRow(idC, "invoice.payment_succeeded", invoiceEvent(idC, invoiceIdC)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (stripe.invoices as any).retrieve = async () => {
      throw new Error("ack-gate-test: simulated Stripe 429 Too Many Requests");
    };
    const rC = await processQueuedEvent(idC); // default deps → real dispatchStripeEvent
    expect("C: gate reached (not short-circuited at claim)", rC.skipped, undefined);
    expect("C: real handler failure is not processed", rC.processed, false);
    const rowC = await StripeWebhookQueue.findOne({ eventId: idC }).lean<{ status?: string; attempts?: number; lastError?: string } | null>();
    expect("C: row is NOT succeeded after a Stripe error", rowC?.status === "succeeded", false);
    expect("C: row requeued for retry", rowC?.status, "queued");
    expect("C: attempts incremented", rowC?.attempts, 1);
    expect(
      "C: real error text reached lastError (not a generic message)",
      (rowC?.lastError ?? "").includes("simulated Stripe 429"),
      true
    );
    const ackC = await ProcessedStripeEvent.countDocuments({ eventId: idC });
    expect("C: no ProcessedStripeEvent row (replay stays possible)", ackC, 0);

    // ── Case D — the $0 trial-bookkeeping guard MUST still ACK. It is a legitimate
    //    "nothing to grant"; un-acking it would spin an infinite retry → dead-letter
    //    loop on every past-due reanchor / anchor-billing migration / join-anchor.
    const idD = `${PREFIX}_d`;
    const invoiceIdD = "in_ack_gate_d";
    await StripeWebhookQueue.create(queueRow(idD, "invoice.payment_succeeded", invoiceEvent(idD, invoiceIdD)));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (stripe.invoices as any).retrieve = async () => zeroTrialInvoice(invoiceIdD);
    const rD = await processQueuedEvent(idD); // default deps → real dispatchStripeEvent
    expect("D: $0 trial invoice is processed", rD.processed, true);
    const rowD = await StripeWebhookQueue.findOne({ eventId: idD }).lean<{ status?: string } | null>();
    expect("D: $0 trial invoice is marked succeeded (no retry loop)", rowD?.status, "succeeded");
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (stripe.invoices as any).retrieve = originalRetrieve;
    try {
      await StripeWebhookQueue.deleteMany({ eventId: { $regex: `^${PREFIX}` } });
      await ProcessedStripeEvent.deleteMany({ eventId: { $regex: `^${PREFIX}` } });
    } catch (cleanupErr) {
      console.error("ack-gate test: cleanup failed", cleanupErr);
    }
  }

  if (failures > 0) {
    console.error(`ack-gate test FAILED (${failures} assertion(s))`);
    process.exit(1);
  }
  console.log("ack-gate test passed");
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
