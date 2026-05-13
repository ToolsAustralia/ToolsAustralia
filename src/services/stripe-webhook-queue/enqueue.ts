import type Stripe from "stripe";
import connectDB from "@/lib/mongodb";
import StripeWebhookQueue from "@/models/StripeWebhookQueue";

/**
 * Idempotently enqueue a Stripe event for async processing.
 * - First call for a given event.id inserts a new queued row with attempts=0
 *   and nextAttemptAt=now (so the sweeper would pick it up immediately if
 *   the fan-out POST never fires).
 * - Subsequent calls for the same event.id are no-ops; the unique index on
 *   eventId is the load-bearing guarantee that duplicates can't multiply.
 */
export async function enqueueStripeEvent(event: Stripe.Event): Promise<{ created: boolean }> {
  await connectDB();
  const now = new Date();
  const result = await StripeWebhookQueue.updateOne(
    { eventId: event.id },
    {
      $setOnInsert: {
        eventId: event.id,
        type: event.type,
        payload: event,
        status: "queued",
        attempts: 0,
        nextAttemptAt: now,
        claimedAt: null,
        lastError: null,
        enqueuedAt: now,
        processedAt: null,
      },
    },
    { upsert: true }
  );
  return { created: result.upsertedCount === 1 };
}
