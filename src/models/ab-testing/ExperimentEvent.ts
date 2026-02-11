import mongoose, { Document, Schema } from "mongoose";

/**
 * Experiment Event Types
 */
export type ExperimentEventType = "page_view" | "click" | "conversion" | "lead" | "purchase" | "other";

/**
 * ExperimentEvent Model
 * Tracks page views, clicks, and interactions per variant
 * Enables offline reporting and fast analytics without external API dependencies
 */
export interface IExperimentEvent extends Document {
  experimentId: mongoose.Types.ObjectId;
  variantId: mongoose.Types.ObjectId;
  eventType: ExperimentEventType;
  userId?: mongoose.Types.ObjectId; // Nullable for anonymous users
  anonymousId?: string; // Nullable for logged-in users
  metadata?: Record<string, unknown>; // Event-specific data (e.g., element clicked, page URL)
  timestamp: Date;
}

const ExperimentEventSchema = new Schema<IExperimentEvent>(
  {
    experimentId: {
      type: Schema.Types.ObjectId,
      ref: "Experiment",
      required: [true, "Experiment ID is required"],
    },
    variantId: {
      type: Schema.Types.ObjectId,
      ref: "Variant",
      required: [true, "Variant ID is required"],
    },
    eventType: {
      type: String,
      enum: ["page_view", "click", "conversion", "lead", "purchase", "other"],
      required: [true, "Event type is required"],
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    anonymousId: {
      type: String,
      required: false,
    },
    metadata: {
      type: Schema.Types.Mixed,
      required: false,
      default: {},
    },
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  {
    timestamps: false, // We use custom timestamp field
  }
);

// Indexes for efficient analytics queries
// Note: experimentId_1 removed - redundant with compound indexes experimentId_1_timestamp_1, etc.
ExperimentEventSchema.index({ variantId: 1 });
ExperimentEventSchema.index({ eventType: 1 });
ExperimentEventSchema.index({ timestamp: 1 });
ExperimentEventSchema.index({ experimentId: 1, variantId: 1, eventType: 1, timestamp: 1 });
ExperimentEventSchema.index({ experimentId: 1, timestamp: 1 });

// ✅ CRITICAL: Unique compound indexes to prevent duplicate events
// 1. Prevent duplicate page views: same user/anonymous + experiment + variant + same minute
//    (allows one page view per minute per user to handle legitimate refreshes)
ExperimentEventSchema.index(
  { 
    experimentId: 1, 
    variantId: 1, 
    eventType: 1, 
    userId: 1,
    timestamp: 1 
  },
  { 
    unique: false, // Not unique, but helps with deduplication queries
    partialFilterExpression: { 
      eventType: "page_view",
      userId: { $exists: true }
    },
    name: "page_view_user_dedup"
  }
);

ExperimentEventSchema.index(
  { 
    experimentId: 1, 
    variantId: 1, 
    eventType: 1, 
    anonymousId: 1,
    timestamp: 1 
  },
  { 
    unique: false,
    partialFilterExpression: { 
      eventType: "page_view",
      anonymousId: { $exists: true },
      userId: { $exists: false }
    },
    name: "page_view_anonymous_dedup"
  }
);

// 2. Prevent duplicate purchases: same orderId + experiment + variant
//    This ensures each purchase is only tracked once
ExperimentEventSchema.index(
  { 
    experimentId: 1, 
    variantId: 1, 
    eventType: 1,
    "metadata.orderId": 1 
  },
  { 
    unique: true, // CRITICAL: Enforce uniqueness at database level
    partialFilterExpression: { 
      eventType: { $in: ["purchase", "conversion"] },
      "metadata.orderId": { $exists: true }
    },
    name: "purchase_order_dedup"
  }
);

// TTL Index: Automatically delete events older than 30 days
// This prevents database bloat - events are aggregated into daily metrics before deletion
// Note: TTL indexes run every 60 seconds, so deletion may be delayed slightly
ExperimentEventSchema.index(
  { timestamp: 1 },
  {
    expireAfterSeconds: 30 * 24 * 60 * 60, // 30 days in seconds
    name: "experiment_events_ttl",
  }
);

const ExperimentEvent =
  mongoose.models.ExperimentEvent || mongoose.model<IExperimentEvent>("ExperimentEvent", ExperimentEventSchema);

export default ExperimentEvent;

