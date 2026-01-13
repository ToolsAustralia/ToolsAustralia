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
      index: true,
    },
    variantId: {
      type: Schema.Types.ObjectId,
      ref: "Variant",
      required: [true, "Variant ID is required"],
      index: true,
    },
    eventType: {
      type: String,
      enum: ["page_view", "click", "conversion", "lead", "purchase", "other"],
      required: [true, "Event type is required"],
      index: true,
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
      index: true,
    },
  },
  {
    timestamps: false, // We use custom timestamp field
  }
);

// Indexes for efficient analytics queries
ExperimentEventSchema.index({ experimentId: 1 });
ExperimentEventSchema.index({ variantId: 1 });
ExperimentEventSchema.index({ eventType: 1 });
ExperimentEventSchema.index({ timestamp: 1 });
ExperimentEventSchema.index({ experimentId: 1, variantId: 1, eventType: 1, timestamp: 1 });
ExperimentEventSchema.index({ experimentId: 1, timestamp: 1 });

const ExperimentEvent =
  mongoose.models.ExperimentEvent || mongoose.model<IExperimentEvent>("ExperimentEvent", ExperimentEventSchema);

export default ExperimentEvent;

