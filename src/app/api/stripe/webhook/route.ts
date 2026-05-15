import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { stripe } from "@/lib/stripe";
import { headers } from "next/headers";
import Stripe from "stripe";
import { webhookLog } from "@/services/stripe-webhook-handlers";
import { enqueueStripeEvent } from "@/services/stripe-webhook-queue/enqueue";
import { processQueuedEvent } from "@/services/stripe-webhook-queue/processQueuedEvent";

/**
 * POST /api/stripe/webhook — thin receiver.
 * Verifies signature, enqueues (idempotent upsert), schedules in-process
 * processing via after(), returns 200 immediately. No index DDL, no inline
 * dedup, no HTTP self-call. Dedup is owned by processQueuedEvent + the
 * 4-layer guarantee (enqueue eventId-unique / claim / PaymentEvent unique).
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    await connectDB();

    const body = await request.text();
    const signature = (await headers()).get("stripe-signature");
    if (!signature) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

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

    const { created } = await enqueueStripeEvent(event);

    if (!created) {
      webhookLog("info", `Event ${event.id} already queued; skipping fan-out`);
    } else {
      after(async () => {
        await processQueuedEvent(event.id);
      });
    }

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
