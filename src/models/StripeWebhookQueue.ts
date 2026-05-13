import mongoose, { Schema, models, model, type InferSchemaType } from "mongoose";

export type StripeWebhookQueueStatus = "queued" | "processing" | "succeeded" | "dead";

const stripeWebhookQueueSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true, index: true },
    type: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      required: true,
      enum: ["queued", "processing", "succeeded", "dead"] as const,
      default: "queued",
      index: true,
    },
    attempts: { type: Number, required: true, default: 0 },
    nextAttemptAt: { type: Date, required: true, default: () => new Date() },
    claimedAt: { type: Date, default: null },
    lastError: { type: String, default: null },
    enqueuedAt: { type: Date, required: true, default: () => new Date() },
    processedAt: { type: Date, default: null },
  },
  { collection: "stripewebhookqueue", timestamps: true }
);

// Sweeper happy-path query: queued rows whose nextAttemptAt has elapsed.
stripeWebhookQueueSchema.index({ status: 1, nextAttemptAt: 1 });
// Orphan detection: in-flight rows whose claim is stale.
stripeWebhookQueueSchema.index({ status: 1, claimedAt: 1 });
// TTL: drop succeeded rows 24h after processedAt — successful webhooks have no
// replay value and don't need to linger. Dead rows are kept 30 days, matching
// Stripe's own event-payload retention window; anything not replayed within
// that window is unreplayable from Stripe's side anyway.
stripeWebhookQueueSchema.index(
  { processedAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24, partialFilterExpression: { status: "succeeded" } }
);
stripeWebhookQueueSchema.index(
  { processedAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 30, partialFilterExpression: { status: "dead" } }
);

export type StripeWebhookQueueDoc = InferSchemaType<typeof stripeWebhookQueueSchema> & {
  _id: mongoose.Types.ObjectId;
};

const StripeWebhookQueue =
  models.StripeWebhookQueue || model("StripeWebhookQueue", stripeWebhookQueueSchema);

export default StripeWebhookQueue;
