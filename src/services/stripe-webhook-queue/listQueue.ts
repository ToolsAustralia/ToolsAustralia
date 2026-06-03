// src/services/stripe-webhook-queue/listQueue.ts
//
// Paged read of the Stripe webhook queue collection. Backs both the admin
// `GET /api/admin/stripe-webhook-queue` route and the Norm
// `GET /v1/stripe-webhook-queue` projection so both report identical rows
// by construction. Framework-agnostic — no Request / NextResponse types.

import StripeWebhookQueue, {
  type StripeWebhookQueueStatus,
} from "@/models/StripeWebhookQueue";

export const STRIPE_WEBHOOK_QUEUE_STATUSES: ReadonlyArray<StripeWebhookQueueStatus> = [
  "queued",
  "processing",
  "succeeded",
  "dead",
];

export interface ListQueueInput {
  status?: StripeWebhookQueueStatus | null;
  /** Defaults 50, clamped to [1, 200]. */
  limit?: number;
  /** Defaults 0, clamped to >= 0. */
  skip?: number;
}

export interface QueueRow {
  /** Mongo `_id` (string form). Admin UI uses this as the replay key. */
  _id: string;
  /** Stripe event id (evt_...). */
  eventId: string;
  /** Stripe event type, e.g. "invoice.paid". */
  type: string;
  status: StripeWebhookQueueStatus;
  attempts: number;
  nextAttemptAt: Date;
  claimedAt: Date | null;
  lastError: string | null;
  enqueuedAt: Date;
  processedAt: Date | null;
}

export interface ListQueueResult {
  rows: QueueRow[];
  total: number;
  limit: number;
  skip: number;
}

/**
 * List rows from the Stripe webhook queue collection, newest enqueued first.
 * Returns the same shape the admin route returns (and the Norm projection
 * subsets via its response schema).
 */
export async function listStripeWebhookQueue(
  input: ListQueueInput = {}
): Promise<ListQueueResult> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const skip = Math.max(input.skip ?? 0, 0);

  const filter: Record<string, unknown> = {};
  if (input.status && (STRIPE_WEBHOOK_QUEUE_STATUSES as ReadonlyArray<string>).includes(input.status)) {
    filter.status = input.status;
  }

  const [rows, total] = await Promise.all([
    StripeWebhookQueue.find(filter)
      .sort({ enqueuedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select(
        "eventId type status attempts nextAttemptAt claimedAt lastError enqueuedAt processedAt"
      )
      .lean(),
    StripeWebhookQueue.countDocuments(filter),
  ]);

  return {
    rows: rows.map((r) => ({
      _id: String(r._id),
      eventId: String(r.eventId),
      type: String(r.type),
      status: r.status as StripeWebhookQueueStatus,
      attempts: typeof r.attempts === "number" ? r.attempts : 0,
      nextAttemptAt: r.nextAttemptAt as Date,
      claimedAt: (r.claimedAt as Date | null | undefined) ?? null,
      lastError: (r.lastError as string | null | undefined) ?? null,
      enqueuedAt: r.enqueuedAt as Date,
      processedAt: (r.processedAt as Date | null | undefined) ?? null,
    })),
    total,
    limit,
    skip,
  };
}
