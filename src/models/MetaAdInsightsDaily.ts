import mongoose, { Document, Schema } from "mongoose";

/**
 * Daily ad-level insights synced from Meta Marketing API (Insights).
 * Idempotent key: adAccountId + date (YYYY-MM-DD) + adId.
 */
export interface IMetaAdInsightsDaily extends Document {
  adAccountId: string;
  /** YYYY-MM-DD (account reporting day; aligned with Meta date_start) */
  date: string;
  adId: string;
  adsetId?: string;
  campaignId?: string;
  campaignName?: string;
  adsetName?: string;
  adName?: string;
  /** Spend in cents (AUD), consistent with PaymentEvent / facebook-marketing processing */
  spendCents: number;
  impressions: number;
  clicks: number;
  /** Meta-reported purchase conversion count (7d_click window, from actions) */
  conversions: number;
  /** Meta-reported purchase value in cents (from action_values) */
  revenueCents: number;
  raw?: Record<string, unknown>;
  syncedAt: Date;
}

const MetaAdInsightsDailySchema = new Schema<IMetaAdInsightsDaily>(
  {
    adAccountId: { type: String, required: true, index: true },
    date: { type: String, required: true },
    adId: { type: String, required: true },
    adsetId: { type: String },
    campaignId: { type: String },
    campaignName: { type: String },
    adsetName: { type: String },
    adName: { type: String },
    spendCents: { type: Number, required: true, default: 0 },
    impressions: { type: Number, required: true, default: 0 },
    clicks: { type: Number, required: true, default: 0 },
    conversions: { type: Number, default: 0 },
    revenueCents: { type: Number, default: 0 },
    raw: { type: Schema.Types.Mixed },
    syncedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

MetaAdInsightsDailySchema.index({ adAccountId: 1, date: 1, adId: 1 }, { unique: true });
MetaAdInsightsDailySchema.index({ adAccountId: 1, date: 1 });

export default mongoose.models.MetaAdInsightsDaily ||
  mongoose.model<IMetaAdInsightsDaily>("MetaAdInsightsDaily", MetaAdInsightsDailySchema);
