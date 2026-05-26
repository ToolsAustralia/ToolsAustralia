import mongoose, { Document, Schema } from "mongoose";

/**
 * Per-user, per-ad snooze for the Facebook Ads Health view's "Investigate" verdict.
 * Cut? snoozes are explicitly disallowed at the service layer.
 * TTL index auto-deletes expired snoozes.
 */
export interface IFacebookAdsHealthSnooze extends Document {
  userId: mongoose.Types.ObjectId;
  adAccountId: string;
  adId: string;
  verdict: "investigate";
  snoozeUntil: Date;
  reason?: string;
  createdAt: Date;
}

const FacebookAdsHealthSnoozeSchema = new Schema<IFacebookAdsHealthSnooze>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    adAccountId: { type: String, required: true },
    adId: { type: String, required: true },
    verdict: { type: String, enum: ["investigate"], required: true },
    snoozeUntil: { type: Date, required: true },
    reason: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

FacebookAdsHealthSnoozeSchema.index({ userId: 1, adId: 1 }, { unique: true });
FacebookAdsHealthSnoozeSchema.index({ snoozeUntil: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.FacebookAdsHealthSnooze ||
  mongoose.model<IFacebookAdsHealthSnooze>("FacebookAdsHealthSnooze", FacebookAdsHealthSnoozeSchema);
