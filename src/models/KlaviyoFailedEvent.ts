/**
 * Klaviyo Failed Event Model
 *
 * Stores failed Klaviyo events for later retry.
 * Ensures no events are lost during Klaviyo API outages.
 *
 * @module models/KlaviyoFailedEvent
 */

import mongoose, { Schema, Document } from "mongoose";
import type { KlaviyoEvent } from "@/types/klaviyo";

export interface IKlaviyoFailedEvent extends Document {
  // Full event data to retry
  event: KlaviyoEvent;

  // Status tracking
  status: "pending" | "processing" | "succeeded" | "failed_permanent";

  // Retry tracking
  retryCount: number; // Current retry attempt (0 = initial failure)
  maxRetries: number; // Maximum retry attempts (default: 10)

  // Error tracking
  lastError?: string; // Last error message
  firstError?: string; // Original error message

  // Timing
  nextRetryAt: Date; // When to retry next (exponential backoff)
  lastRetriedAt?: Date; // Last retry attempt timestamp
  succeededAt?: Date; // When event was successfully sent

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const KlaviyoFailedEventSchema = new Schema<IKlaviyoFailedEvent>(
  {
    event: {
      type: Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "processing", "succeeded", "failed_permanent"],
      default: "pending",
      required: true,
    },
    retryCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    maxRetries: {
      type: Number,
      default: 10,
      min: 1,
    },
    lastError: {
      type: String,
    },
    firstError: {
      type: String,
    },
    nextRetryAt: {
      type: Date,
      required: true,
      index: true, // Index for efficient querying of events ready to retry
    },
    lastRetriedAt: {
      type: Date,
    },
    succeededAt: {
      type: Date,
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
  }
);

// Indexes for efficient querying
// Index 1: Find pending events ready to retry (most common query)
KlaviyoFailedEventSchema.index({ status: 1, nextRetryAt: 1 });

// Index 2: Find events by status for statistics
KlaviyoFailedEventSchema.index({ status: 1 });

// Index 3: Find old events for cleanup
KlaviyoFailedEventSchema.index({ createdAt: 1 });

// Index 4: Find succeeded events older than X days
KlaviyoFailedEventSchema.index({ status: 1, succeededAt: 1 });

// Index 5: Find permanent failures older than X days
KlaviyoFailedEventSchema.index({ status: 1, createdAt: 1 });

const KlaviyoFailedEvent =
  mongoose.models.KlaviyoFailedEvent ||
  mongoose.model<IKlaviyoFailedEvent>("KlaviyoFailedEvent", KlaviyoFailedEventSchema);

export default KlaviyoFailedEvent;
