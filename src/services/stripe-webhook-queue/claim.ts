import connectDB from "@/lib/mongodb";
import StripeWebhookQueue, { type StripeWebhookQueueDoc } from "@/models/StripeWebhookQueue";

/**
 * Atomically transition a queued row to `processing` and return it. Returns
 * null if no queued row exists for this eventId (already processing,
 * already succeeded, dead-lettered, or never enqueued). The atomic
 * findOneAndUpdate is what guarantees that fan-out POST and the sweeper
 * cannot both claim the same event.
 */
export async function claimNextAttempt(eventId: string): Promise<StripeWebhookQueueDoc | null> {
  await connectDB();
  const claimed = await StripeWebhookQueue.findOneAndUpdate(
    { eventId, status: "queued" },
    { $set: { status: "processing", claimedAt: new Date() } },
    { new: true }
  ).lean<StripeWebhookQueueDoc | null>();
  return claimed;
}
