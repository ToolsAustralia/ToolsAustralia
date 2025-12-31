import mongoose, { Schema } from "mongoose";
import type { IDailyMetrics } from "@/types/metrics/DailyMetrics";

const DailyMetricsSchema = new Schema<IDailyMetrics>(
  {
    date: {
      type: Date,
      required: true,
      unique: true,
      index: true,
    },
    adSpend: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    revenue: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    salesCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    profit: {
      type: Number,
      required: true,
      default: 0,
    },
    roas: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    conversions: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    impressions: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    clicks: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    ctr: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 100,
    },
    cpc: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    collection: "dailymetrics",
  }
);

// Compound index for date range queries
DailyMetricsSchema.index({ date: 1, createdAt: -1 });

// Ensure unique date constraint
DailyMetricsSchema.index({ date: 1 }, { unique: true });

// Clear cached model to ensure schema updates are applied
const modelName = "DailyMetrics";
if (mongoose.models[modelName]) {
  delete mongoose.models[modelName];
}

export default mongoose.model<IDailyMetrics>(modelName, DailyMetricsSchema);

