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
    | "BenefitsReversed";
  userId: mongoose.Types.ObjectId;
  packageType: "one-time" | "membership" | "upsell" | "mini-draw";
  packageId?: string;
  packageName?: string;
  data: {
    entries?: number;
    points?: number;
    price?: number;
    [key: string]: string | number | boolean | undefined;
  };
  processedBy: "api" | "webhook";
  timestamp: Date;
  // A/B Testing fields (optional)
  experimentId?: string;
  variantId?: string;
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
        "BenefitsReversed",
      ],
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true, // For fast user lookups
    },
    packageType: {
      type: String,
      required: true,
      enum: ["one-time", "membership", "upsell", "mini-draw"],
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
      enum: ["api", "webhook"],
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
// A/B Testing analytics index
PaymentEventSchema.index({ experimentId: 1, variantId: 1 });

// ✅ CRITICAL: Clear cached model to ensure schema updates (especially enum changes) are applied
// This is necessary when enum values like "RefundProcessed" and "BenefitsReversed" are added
const modelName = "PaymentEvent";
if (mongoose.models[modelName]) {
  delete mongoose.models[modelName];
}

export default mongoose.model<IPaymentEvent>(modelName, PaymentEventSchema);
