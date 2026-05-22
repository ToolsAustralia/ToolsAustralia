import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormStripeWebhookQueueListSchema } from "@/lib/internal-norm/schemas/stripe-webhook-queue";
import {
  STRIPE_WEBHOOK_QUEUE_STATUSES,
  listStripeWebhookQueue,
} from "@/services/stripe-webhook-queue/listQueue";

const QuerySchema = z.object({
  status: z.enum(STRIPE_WEBHOOK_QUEUE_STATUSES as unknown as [string, ...string[]]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
});

export const GET = withNorm(
  {
    tier: "read",
    registryKey: "stripe-webhook-queue.list",
    requiredPermission: "errorReports.view",
    responseSchema: NormStripeWebhookQueueListSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }
    const result = await listStripeWebhookQueue({
      status: parsed.data.status as (typeof STRIPE_WEBHOOK_QUEUE_STATUSES)[number] | undefined,
      limit: parsed.data.limit,
      skip: parsed.data.skip,
    });
    return ctx.ok({
      rows: result.rows.map((r) => ({
        id: r._id,
        eventId: r.eventId,
        type: r.type,
        status: r.status,
        attempts: r.attempts,
        nextAttemptAt: r.nextAttemptAt.toISOString(),
        claimedAt: r.claimedAt ? r.claimedAt.toISOString() : null,
        lastError: r.lastError,
        enqueuedAt: r.enqueuedAt.toISOString(),
        processedAt: r.processedAt ? r.processedAt.toISOString() : null,
      })),
      total: result.total,
      limit: result.limit,
      skip: result.skip,
    });
  },
);
