import { z } from "zod";

const StripeWebhookQueueStatusSchema = z.enum([
  "queued",
  "processing",
  "succeeded",
  "dead",
]);

const StripeWebhookQueueRowSchema = z.object({
  id: z.string().describe("Mongo `_id` of the queue row."),
  eventId: z.string().describe("Stripe event id (evt_...)."),
  type: z.string().describe("Stripe event type, e.g. invoice.paid."),
  status: StripeWebhookQueueStatusSchema,
  attempts: z
    .number()
    .int()
    .nonnegative()
    .describe("Number of processing attempts so far (including the current one)."),
  nextAttemptAt: z
    .string()
    .describe("ISO 8601 UTC. When the queue worker is next scheduled to attempt this row."),
  claimedAt: z
    .string()
    .nullable()
    .describe(
      "ISO 8601 UTC. Set when a worker has claimed the row for processing; null when not in-flight.",
    ),
  lastError: z
    .string()
    .nullable()
    .describe("Last error message from a failed attempt; null if no failure recorded."),
  enqueuedAt: z.string().describe("ISO 8601 UTC. When the row was inserted into the queue."),
  processedAt: z
    .string()
    .nullable()
    .describe(
      "ISO 8601 UTC. When the row reached a terminal state (succeeded / dead); null while still in-flight.",
    ),
});

export const NormStripeWebhookQueueListSchema = z.object({
  rows: z.array(StripeWebhookQueueRowSchema),
  total: z
    .number()
    .int()
    .nonnegative()
    .describe("Total matching rows across all pages (filter-aware, ignores limit/skip)."),
  limit: z
    .number()
    .int()
    .positive()
    .describe("Page size actually applied (clamped to [1, 200])."),
  skip: z
    .number()
    .int()
    .nonnegative()
    .describe("Offset actually applied (clamped to >= 0)."),
});
