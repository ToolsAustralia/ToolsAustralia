import mongoose, { Document, Schema } from "mongoose";

/**
 * Daily ad-level insights synced from Snapchat Marketing API.
 * Schema mirrors MetaAdInsightsDaily so analytics UIs can share primitives.
 * Idempotent key: adAccountId + date (YYYY-MM-DD) + adId.
 *
 * NOTE: No sync service writes to this collection yet — see TikTok model note.
 */
export interface ISnapchatAdInsightsDaily extends Document {
  adAccountId: string;
  date: string;
  adId: string;
  adsetId?: string;
  campaignId?: string;
  campaignName?: string;
  adsetName?: string;
  adName?: string;
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenueCents: number;
  raw?: Record<string, unknown>;
  syncedAt: Date;
}

const SnapchatAdInsightsDailySchema = new Schema<ISnapchatAdInsightsDaily>(
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

SnapchatAdInsightsDailySchema.index({ adAccountId: 1, date: 1, adId: 1 }, { unique: true });
SnapchatAdInsightsDailySchema.index({ adAccountId: 1, date: 1 });

export default mongoose.models.SnapchatAdInsightsDaily ||
  mongoose.model<ISnapchatAdInsightsDaily>("SnapchatAdInsightsDaily", SnapchatAdInsightsDailySchema);
