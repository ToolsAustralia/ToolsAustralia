import connectDB from "@/lib/mongodb";
import StripeWebhookQueue, { type StripeWebhookQueueDoc } from "@/models/StripeWebhookQueue";
import { computeNextAttempt } from "./backoff";

export async function markSucceeded(eventId: string): Promise<void> {
  await connectDB();
  await StripeWebhookQueue.updateOne(
    { eventId },
    {
      $set: {
        status: "succeeded",
        processedAt: new Date(),
        claimedAt: null,
        lastError: null,
      },
    }
  );
}

/**
 * Increment attempts and either reschedule the row for another retry or
 * transition it to `dead` when the retry budget is exhausted.
 */
export async function markFailed(eventId: string, error: string): Promise<void> {
  await connectDB();
  const row = await StripeWebhookQueue.findOne({ eventId }).lean<StripeWebhookQueueDoc | null>();
  if (!row) return;
  const nextAttempts = (row.attempts ?? 0) + 1;
  const decision = computeNextAttempt(nextAttempts, new Date());
  if (decision === "dead") {
    await StripeWebhookQueue.updateOne(
      { eventId },
      {
        $set: {
          status: "dead",
          attempts: nextAttempts,
          lastError: error,
          claimedAt: null,
          // Anchor for the 30-day TTL — dead rows expire 30d after this timestamp.
          processedAt: new Date(),
        },
      }
    );
    return;
  }
  await StripeWebhookQueue.updateOne(
    { eventId },
    {
      $set: {
        status: "queued",
        attempts: nextAttempts,
        nextAttemptAt: decision,
        lastError: error,
        claimedAt: null,
      },
    }
  );
}
