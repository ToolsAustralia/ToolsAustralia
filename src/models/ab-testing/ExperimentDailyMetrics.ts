import mongoose, { Document, Schema } from "mongoose";

/**
 * Experiment Daily Metrics Model
 * Stores aggregated metrics per day per variant
 * This is more efficient than storing individual events
 * 
 * Best Practice: Aggregate events daily to prevent database bloat
 * Individual events are kept for 30 days, then deleted after aggregation
 */
export interface IExperimentDailyMetrics extends Document {
  experimentId: mongoose.Types.ObjectId;
  variantId: mongoose.Types.ObjectId;
  date: Date; // Date in AEST (normalized to start of day)
  
  // Aggregated counts
  pageViews: number;
  clicks: number;
  conversions: number;
  leads: number;
  purchases: number;
  uniqueVisitors: number; // Distinct users who visited
  
  // Revenue (aggregated from PaymentEvents)
  revenue: number;
  
  // Last updated timestamp
  lastUpdated: Date;
  
  // Metadata for debugging
  eventCount?: number; // Number of individual events aggregated (for verification)
}

const ExperimentDailyMetricsSchema = new Schema<IExperimentDailyMetrics>(
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
    date: {
      type: Date,
      required: [true, "Date is required"],
      index: true,
    },
    pageViews: {
      type: Number,
      default: 0,
      required: true,
    },
    clicks: {
      type: Number,
      default: 0,
      required: true,
    },
    conversions: {
      type: Number,
      default: 0,
      required: true,
    },
    leads: {
      type: Number,
      default: 0,
      required: true,
    },
    purchases: {
      type: Number,
      default: 0,
      required: true,
    },
    uniqueVisitors: {
      type: Number,
      default: 0,
      required: true,
    },
    revenue: {
      type: Number,
      default: 0,
      required: true,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
      required: true,
    },
    eventCount: {
      type: Number,
      required: false,
    },
  },
  {
    timestamps: false, // We use custom lastUpdated field
  }
);

// Compound unique index: one document per experiment/variant/date combination
ExperimentDailyMetricsSchema.index(
  { experimentId: 1, variantId: 1, date: 1 },
  { unique: true }
);

// Indexes for efficient queries
ExperimentDailyMetricsSchema.index({ experimentId: 1, date: 1 });
ExperimentDailyMetricsSchema.index({ variantId: 1, date: 1 });
ExperimentDailyMetricsSchema.index({ date: 1 });

const ExperimentDailyMetrics =
  mongoose.models.ExperimentDailyMetrics ||
  mongoose.model<IExperimentDailyMetrics>("ExperimentDailyMetrics", ExperimentDailyMetricsSchema);

export default ExperimentDailyMetrics;

