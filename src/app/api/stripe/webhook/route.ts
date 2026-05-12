import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import ProcessedStripeEvent from "@/models/ProcessedStripeEvent";
import { stripe } from "@/lib/stripe";
import { headers } from "next/headers";
import Stripe from "stripe";
import { ensureIndexesOnce } from "@/utils/database/ensure-indexes";
import {
  dispatchStripeEvent,
  ackProcessedStripeEventOnce,
  isEventProcessed,
  markEventProcessed,
  webhookLog,
} from "@/services/stripe-webhook-handlers";

/**
 * POST /api/stripe/webhook
 * Receives Stripe webhook events, verifies the signature, deduplicates, then
 * dispatches to the appropriate handler via dispatchStripeEvent.
 *
 * All handler logic lives in src/services/stripe-webhook-handlers/index.ts.
 * This file owns only the request flow: signature verification, dedup checks,
 * and response shapes. (Task 7 of the Stripe Webhook Async Queue plan.)
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    await connectDB();

    // ✅ CRITICAL: Ensure PaymentEvent indexes are created BEFORE processing any webhooks
    // This is blocking and must complete before any payment processing happens
    // console.log("🔒 WEBHOOK (Old Handler): Ensuring indexes before processing...");
    await ensureIndexesOnce();
    // console.log("✅ WEBHOOK (Old Handler): Indexes ensured, proceeding with webhook processing");

    const body = await request.text();
    const signature = (await headers()).get("stripe-signature");

    if (!signature) {
      // console.error("❌ Missing stripe-signature header");
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    // ✅ CRITICAL: Validate webhook secret before using it
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      // console.error("❌ CRITICAL: STRIPE_WEBHOOK_SECRET is not set - webhook processing disabled");
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

    // Dispatch to the appropriate handler and get shouldMarkAsProcessed back.
    // The switch that used to live here has moved to dispatchStripeEvent in
    // src/services/stripe-webhook-handlers/index.ts (Task 7). Behaviour is
    // identical — the route still calls handlers synchronously.
    const { shouldMarkAsProcessed } = await dispatchStripeEvent(event);

    await ackProcessedStripeEventOnce(event);

    // ✅ WEBHOOK-FIRST: Mark this payment as processed ONLY if we actually processed it
    if (paymentIntentId && shouldMarkAsProcessed) {
      await markEventProcessed(paymentIntentId);
    }

    // ✅ PERFORMANCE MONITORING: Track webhook processing time
    const processingTime = Date.now() - startTime;
    if (processingTime > 3000) {
      webhookLog("warn", `⚠️ Webhook processing exceeded 3 seconds: ${processingTime}ms for event ${event.type}`);
    } else {
      webhookLog("info", `✅ Webhook processed in ${processingTime}ms for event ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const processingTime = Date.now() - startTime;
    webhookLog("error", `Error processing webhook: ${error} (processed in ${processingTime}ms)`);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
