import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { claimNextAttempt } from "@/services/stripe-webhook-queue/claim";
import { markFailed, markSucceeded } from "@/services/stripe-webhook-queue/markResult";
import {
  ackProcessedStripeEventOnce,
  dispatchStripeEvent,
} from "@/services/stripe-webhook-handlers";

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WORKER_INTERNAL_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Worker not configured" }, { status: 500 });
  }
  if (request.headers.get("x-internal-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let eventId: string | undefined;
  try {
    const body = (await request.json()) as { eventId?: string };
    eventId = body.eventId;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!eventId) {
    return NextResponse.json({ error: "Missing eventId" }, { status: 400 });
  }

  const row = await claimNextAttempt(eventId);
  if (!row) {
    return NextResponse.json({ skipped: true, reason: "not_claimable" });
  }

  try {
    const payload = row.payload as Stripe.Event;
    const { shouldMarkAsProcessed } = await dispatchStripeEvent(payload);
    if (shouldMarkAsProcessed) {
      await ackProcessedStripeEventOnce(payload);
    }
    await markSucceeded(eventId);
    return NextResponse.json({ processed: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await markFailed(eventId, message);
    return NextResponse.json({ processed: false, error: message }, { status: 200 });
    // 200 (not 5xx) on purpose: the caller is our own sweeper/receiver, not
    // Stripe. We don't want sweeper/fan-out to retry at the HTTP layer; the
    // queue row itself is now scheduled for the next attempt.
  }
}
