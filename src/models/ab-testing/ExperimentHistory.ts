import mongoose, { Document, Schema } from "mongoose";

/**
 * Experiment History Action Types
 */
export type ExperimentHistoryAction = "created" | "updated" | "activated" | "resumed" | "paused" | "ended" | "variant_added" | "variant_updated" | "variant_deleted" | "winner_declared";

/**
 * ExperimentHistory Model
 * Audit log for experiment changes and versioning
 */
export interface IExperimentHistory extends Document {
  experimentId: mongoose.Types.ObjectId;
  action: ExperimentHistoryAction;
  changedBy: mongoose.Types.ObjectId;
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  };
  timestamp: Date;
}

const ExperimentHistorySchema = new Schema<IExperimentHistory>(
  {
    experimentId: {
      type: Schema.Types.ObjectId,
      ref: "Experiment",
      required: [true, "Experiment ID is required"],
    },
    action: {
      type: String,
      enum: ["created", "updated", "activated", "resumed", "paused", "ended", "variant_added", "variant_updated", "variant_deleted", "winner_declared"],
      required: [true, "Action is required"],
    },
    changedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Changed by is required"],
    },
    changes: {
      type: Schema.Types.Mixed,
      required: false,
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

// Indexes for audit log queries
ExperimentHistorySchema.index({ experimentId: 1 });
ExperimentHistorySchema.index({ timestamp: 1 });
ExperimentHistorySchema.index({ experimentId: 1, timestamp: 1 });

const ExperimentHistory =
  mongoose.models.ExperimentHistory || mongoose.model<IExperimentHistory>("ExperimentHistory", ExperimentHistorySchema);

export default ExperimentHistory;

