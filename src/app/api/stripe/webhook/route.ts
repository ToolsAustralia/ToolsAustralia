import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import ProcessedStripeEvent from "@/models/ProcessedStripeEvent";
import { stripe } from "@/lib/stripe";
import { headers } from "next/headers";
import Stripe from "stripe";
import { ensureIndexesOnce } from "@/utils/database/ensure-indexes";
import {
  ackProcessedStripeEventOnce,
  isEventProcessed,
  webhookLog,
} from "@/services/stripe-webhook-handlers";
import { enqueueStripeEvent } from "@/services/stripe-webhook-queue/enqueue";
import { dispatchToWorker } from "@/services/stripe-webhook-queue/dispatchWorker";

/**
 * POST /api/stripe/webhook
 * Receives Stripe webhook events, verifies the signature, deduplicates, then
 * enqueues for async processing via the worker route (/api/stripe/process-event).
 *
 * Flow (Task 10 — ack-fast + queued):
 *   1. Verify Stripe signature
 *   2. Dedup via ProcessedStripeEvent (already-processed events → 200 skipped)
 *   3. Dedup via user.processedPayments (payment-event specific)
 *   4. enqueueStripeEvent(event) — idempotent Mongo upsert
 *   5. after() fan-out POST to /api/stripe/process-event
 *   6. Return 200 IMMEDIATELY — all handler work runs asynchronously in the worker
 *
 * The worker owns: dispatchStripeEvent, ackProcessedStripeEventOnce (happy path),
 * markEventProcessed. The sweeper cron (/api/cron/process-stripe-webhook-queue)
 * covers any fan-out that Vercel kills before it fires.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    await connectDB();

    // ✅ CRITICAL: Ensure PaymentEvent indexes are created BEFORE processing any webhooks
    // This is blocking and must complete before any payment processing happens
    await ensureIndexesOnce();

    const body = await request.text();
    const signature = (await headers()).get("stripe-signature");

    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    // ✅ CRITICAL: Validate webhook secret before using it
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error("❌ Webhook signature verification failed:", err);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const stripeEventId = event.id;
    const existingStripeEvent = await ProcessedStripeEvent.findOne({ eventId: stripeEventId });
    if (existingStripeEvent) {
      webhookLog("info", `Stripe event ${stripeEventId} already processed, skipping duplicate webhook`);
      return NextResponse.json({ received: true, skipped: true, reason: "duplicate_stripe_event" });
    }

    // ✅ WEBHOOK-FIRST: Check if this payment has already been processed
    // For payment events, check using payment intent ID
    let paymentIntentId: string | undefined;
    if (event.type.includes("payment_intent")) {
      paymentIntentId = (event.data.object as Stripe.PaymentIntent).id;
    } else if (event.type.includes("invoice")) {
      paymentIntentId = `invoice_${(event.data.object as Stripe.Invoice).id}`;
    }

    if (paymentIntentId) {
      // ✅ CRITICAL FIX: Only check duplicates for actual payment events
      // Don't check for invoice.created, invoice.finalized, etc.
      const isPaymentEvent =
        event.type === "payment_intent.succeeded" ||
        event.type === "invoice.payment_succeeded" ||
        event.type === "invoice.paid";

      if (isPaymentEvent) {
        // ✅ CRITICAL: Enhanced duplicate detection for invoice payments
        if (paymentIntentId.startsWith("invoice_")) {
          const invoiceId = paymentIntentId.replace("invoice_", "");

          // Check if this exact invoice has already been processed (in any format)
          const paymentAlreadyProcessed = await isEventProcessed(paymentIntentId);
          if (paymentAlreadyProcessed) {
            webhookLog("info", `Payment ${paymentIntentId} already processed, skipping`);
            await ackProcessedStripeEventOnce(event);
            return NextResponse.json({ received: true, skipped: true });
          }

          // ✅ CRITICAL: Check if any variation of this invoice has been processed
          // This catches timestamp variations like invoice_in_123_1759802851877
          // Note: We only process invoice.payment_succeeded, not invoice.paid
          try {
            const invoice = event.data.object as Stripe.Invoice;
            if (invoice.customer) {
              const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer.id;
              const user = await User.findOne({ stripeCustomerId: customerId });

              if (user && user.processedPayments) {
                const hasDuplicateInvoice = user.processedPayments.some((processedPayment) => {
                  // Exact match on the full key
                  if (processedPayment === `invoice_${invoiceId}`) return true;

                  // Strip timestamp suffix and compare base invoice IDs exactly
                  if (processedPayment.startsWith("invoice_")) {
                    const storedBase = processedPayment.replace("invoice_", "").split("_ts_")[0];
                    const incomingBase = invoiceId.split("_ts_")[0];
                    return storedBase === incomingBase;
                  }

                  return false;
                });

                if (hasDuplicateInvoice) {
                  webhookLog(
                    "info",
                    `Invoice ${invoiceId} already processed in user's processedPayments, skipping webhook`
                  );
                  await ackProcessedStripeEventOnce(event);
                  return NextResponse.json({ received: true, skipped: true });
                }
              }
            }
          } catch (error) {
            webhookLog("error", `Error in webhook duplicate detection: ${error}`);
            // Continue with processing if duplicate detection fails
          }
        } else {
          // For non-invoice payments, use standard duplicate detection
          const paymentAlreadyProcessed = await isEventProcessed(paymentIntentId);
          if (paymentAlreadyProcessed) {
            webhookLog("info", `Payment ${paymentIntentId} already processed, skipping`);
            await ackProcessedStripeEventOnce(event);
            return NextResponse.json({ received: true, skipped: true });
          }
        }
      } else {
        // Not a payment event - skip duplicate check
        webhookLog("info", `Event ${event.type} is not a payment event, skipping duplicate check`);
      }
    }

    // Environment-aware logging
    webhookLog("info", `Received webhook event: ${event.type} [${event.id}]`, {
      environment: process.env.NODE_ENV,
      klaviyoMode: process.env.KLAVIYO_MODE,
    });

    // Debug: Log subscription-related events
    if (
      event.type.includes("subscription") ||
      event.type.includes("invoice") ||
      event.type.includes("payment_intent")
    ) {
      const eventObject = event.data.object as { id?: string; status?: string };
      webhookLog("info", `Subscription-related event: ${event.type}`, {
        eventId: event.id,
        objectId: eventObject?.id,
        status: eventObject?.status,
      });
    }

    // Enqueue the event for async processing.
    // enqueueStripeEvent is idempotent — the unique index on eventId guarantees
    // at-most-one queue row per Stripe event ID.
    const { created } = await enqueueStripeEvent(event);

    if (!created) {
      webhookLog("info", `Event ${event.id} already queued; skipping enqueue + fan-out`);
    } else {
      // Schedule fan-out POST after the response is sent. The sweeper cron
      // (/api/cron/process-stripe-webhook-queue) is the safety net for any
      // case where Vercel kills the lambda before fan-out fires.
      after(async () => {
        await dispatchToWorker(event.id, "webhook-receiver");
      });
    }

    // ✅ PERFORMANCE MONITORING: Track receiver turnaround (enqueue only, not handler)
    const enqueuedIn = Date.now() - startTime;
    if (enqueuedIn > 1000) {
      webhookLog("warn", `⚠️ Webhook receiver took ${enqueuedIn}ms to enqueue event ${event.type}`);
    } else {
      webhookLog("info", `✅ Webhook enqueued in ${enqueuedIn}ms for event ${event.type}`);
    }

    return NextResponse.json({ received: true, queued: created });
  } catch (error) {
    const enqueuedIn = Date.now() - startTime;
    webhookLog("error", `Error in webhook receiver: ${error} (after ${enqueuedIn}ms)`);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
