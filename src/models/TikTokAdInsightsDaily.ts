import mongoose, { Document, Schema } from "mongoose";

/**
 * Daily ad-level insights synced from TikTok Marketing API.
 * Schema mirrors MetaAdInsightsDaily so analytics UIs can share primitives.
 * Idempotent key: adAccountId + date (YYYY-MM-DD) + adId. (adAccountId holds the
 * TikTok advertiser_id.)
 *
 * Written by TikTokInsightsSyncService (src/services/admin/tiktok/), fed nightly by
 * the /api/cron/sync-tiktok-ads cron; read by the admin TikTok per-ad breakdown
 * (/api/admin/tiktok-ads/insights). conversions/revenueCents are TikTok-reported
 * (the platform's own attribution), matching how MetaAdInsightsDaily stores
 * Meta-reported numbers — NOT a join of first-party PaymentEvent sales.
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

// TTL mirrors MetaAdInsightsDaily: dev = 35 days, prod = 60 days. Anchored to
// syncedAt so the nightly cron's re-upsert of the trailing window refreshes the
// clock on touched rows, keeping active ads alive past 60 days.
const TIKTOK_INSIGHTS_TTL_SECONDS =
  (process.env.NODE_ENV === "production" ? 60 : 35) * 24 * 60 * 60;
TikTokAdInsightsDailySchema.index(
  { syncedAt: 1 },
  { expireAfterSeconds: TIKTOK_INSIGHTS_TTL_SECONDS },
);

export default mongoose.models.TikTokAdInsightsDaily ||
  mongoose.model<ITikTokAdInsightsDaily>("TikTokAdInsightsDaily", TikTokAdInsightsDailySchema);
