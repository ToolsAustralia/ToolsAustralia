import mongoose, { Document, Schema } from "mongoose";

export interface IPaymentEvent extends Document {
  _id: string; // Format: "BenefitsGranted-pi_1234567890" for natural idempotency
  paymentIntentId: string;
  eventType:
    | "BenefitsGranted"
    | "PaymentProcessed"
    | "SubscriptionActivated"
    | "UpsellProcessed"
    | "MiniDrawProcessed"
    | "RefundProcessed"
    | "RefundPartial"
    | "BenefitsReversed";
  userId: mongoose.Types.ObjectId;
  packageType: "one-time" | "membership" | "upsell" | "mini-draw" | "shop";
  packageId?: string;
  packageName?: string;
  data: {
    entries?: number;
    points?: number;
    price?: number;
    [key: string]: string | number | boolean | undefined;
  };
  processedBy: "api" | "webhook" | "admin";
  timestamp: Date;
  // A/B Testing fields (optional)
  experimentId?: string;
  variantId?: string;
  // Attribution fields (denormalized from Stripe metadata for ad-level aggregation)
  attributionAdId: string | null;
  attributionAdsetId: string | null;
  attributionCampaignId: string | null;
  // Single-platform attribution (set going forward by the resolver; null for pre-feature rows)
  convertingPlatform: import("@/types/attribution").ConvertingPlatform | null;
  attributionConfidence: import("@/types/attribution").AttributionConfidence | null;
  isRenewal: boolean;
}

const PaymentEventSchema = new Schema<IPaymentEvent>(
  {
    _id: {
      type: String,
      required: true,
      // Custom ID format: "BenefitsGranted-pi_1234567890"
      // This provides natural idempotency - same payment can't be processed twice
    },
    paymentIntentId: {
      type: String,
      required: true,
      index: true, // For fast lookups
    },
    eventType: {
      type: String,
      required: true,
      enum: [
        "BenefitsGranted",
        "PaymentProcessed",
        "SubscriptionActivated",
        "UpsellProcessed",
        "MiniDrawProcessed",
        "RefundProcessed",
        "RefundPartial",
        "BenefitsReversed",
      ],
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      // No index: true - redundant with compound index userId_1_timestamp_-1
    },
    packageType: {
      type: String,
      required: true,
      // Keep in lockstep with the IPaymentEvent union above. Widening only the
      // interface leaves tsc green and throws a Mongoose ValidationError on save;
      // widening only the enum leaves tsc rejecting the write.
      enum: ["one-time", "membership", "upsell", "mini-draw", "shop"],
    },
    packageId: {
      type: String,
      required: false,
    },
    packageName: {
      type: String,
      required: false,
    },
    data: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
    processedBy: {
      type: String,
      required: true,
      enum: ["api", "webhook", "admin"],
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true, // For time-based queries
    },
    // A/B Testing fields (optional)
    experimentId: {
      type: String,
      required: false,
    },
    variantId: {
      type: String,
      required: false,
    },
    // Attribution fields (denormalized from Stripe metadata for ad-level aggregation)
    attributionAdId: {
      type: String,
      default: null,
      index: true,
    },
    attributionAdsetId: {
      type: String,
      default: null,
      index: true,
    },
    attributionCampaignId: {
      type: String,
      default: null,
      index: true,
    },
    convertingPlatform: {
      type: String,
      enum: ["meta", "tiktok", "snapchat", "klaviyo_email", "klaviyo_sms", "google", "direct", "other"],
      default: null,
    },
    attributionConfidence: {
      type: String,
      enum: ["click", "utm_only", "inferred_backfill"],
      default: null,
    },
    isRenewal: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: false, // We use custom timestamp field
    collection: "paymentevents", // Explicit collection name
  }
);

// ✅ CRITICAL: Unique compound index to prevent duplicate processing of same payment
// This ensures only ONE BenefitsGranted event can exist per PaymentIntent
PaymentEventSchema.index({ paymentIntentId: 1, eventType: 1 }, { unique: true });

// Other indexes for efficient queries
PaymentEventSchema.index({ userId: 1, timestamp: -1 });
PaymentEventSchema.index({ packageType: 1, timestamp: -1 });
// Every net-revenue / metrics aggregation starts with `$match: { eventType, timestamp: {range} }`
// (see src/utils/payment/payment-event-net-queries.ts). Before this index, none of the eleven
// existing indexes led with `eventType`, so those queries range-scanned `timestamp` and discarded
// non-matching event types in memory — cost grew with total collection size, not with matches.
// Created in production by scripts/migrations/2026-08-17-payment-event-eventtype-timestamp-index.ts;
// declared here so fresh environments get it too.
PaymentEventSchema.index({ eventType: 1, timestamp: -1 });
// Revenue-by-platform aggregation (dashboard). attributionConfidence is filtered
// in-memory, NOT part of the index key (low cardinality, poor selectivity).
PaymentEventSchema.index({ convertingPlatform: 1, timestamp: -1 });
// A/B Testing analytics index
PaymentEventSchema.index({ experimentId: 1, variantId: 1 });

// ✅ CRITICAL: Clear cached model to ensure schema updates (especially enum changes) are applied
// This is necessary when enum values like "RefundProcessed" and "BenefitsReversed" are added
const modelName = "PaymentEvent";
if (mongoose.models[modelName]) {
  delete mongoose.models[modelName];
}

export default mongoose.model<IPaymentEvent>(modelName, PaymentEventSchema);
