import mongoose, { Document, Schema } from "mongoose";

/**
 * Daily ad-level insights synced from TikTok Marketing API.
 * Schema mirrors MetaAdInsightsDaily so analytics UIs can share primitives.
 * Idempotent key: adAccountId + date (YYYY-MM-DD) + adId.
 *
 * NOTE: No sync service writes to this collection yet — the TikTok Marketing API
 * integration lands in a follow-up spec. This model is created so the admin
 * shell tab has somewhere to query when that spec runs.
 */
export interface ITikTokAdInsightsDaily extends Document {
  adAccountId: string;
  date: string;
  adId: string;
  adsetId?: string;
  campaignId?: string;
  campaignName?: string;
  adsetName?: string;
  adName?: string;
  /** Spend in cents (AUD). */
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenueCents: number;
  raw?: Record<string, unknown>;
  syncedAt: Date;
}

const TikTokAdInsightsDailySchema = new Schema<ITikTokAdInsightsDaily>(
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
  { timestamps: false },
);

TikTokAdInsightsDailySchema.index({ adAccountId: 1, date: 1, adId: 1 }, { unique: true });
TikTokAdInsightsDailySchema.index({ adAccountId: 1, date: 1 });

export default mongoose.models.TikTokAdInsightsDaily ||
  mongoose.model<ITikTokAdInsightsDaily>("TikTokAdInsightsDaily", TikTokAdInsightsDailySchema);
