import mongoose, { Document, Schema } from "mongoose";

/**
 * Materialized aggregate: spend and delivery metrics per canonical landing URL per day.
 */
export interface ILandingPageMetricsDaily extends Document {
  adAccountId: string;
  /** YYYY-MM-DD */
  date: string;
  canonicalUrl: string;
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenueCents: number;
  adIds: string[];
  computedAt: Date;
}

const LandingPageMetricsDailySchema = new Schema<ILandingPageMetricsDaily>(
  {
    adAccountId: { type: String, required: true, index: true },
    date: { type: String, required: true },
    canonicalUrl: { type: String, required: true },
    spendCents: { type: Number, required: true, default: 0 },
    impressions: { type: Number, required: true, default: 0 },
    clicks: { type: Number, required: true, default: 0 },
    conversions: { type: Number, default: 0 },
    revenueCents: { type: Number, default: 0 },
    adIds: { type: [String], default: [] },
    computedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

LandingPageMetricsDailySchema.index({ adAccountId: 1, date: 1, canonicalUrl: 1 }, { unique: true });
LandingPageMetricsDailySchema.index({ adAccountId: 1, date: 1 });

export default mongoose.models.LandingPageMetricsDaily ||
  mongoose.model<ILandingPageMetricsDaily>("LandingPageMetricsDaily", LandingPageMetricsDailySchema);
