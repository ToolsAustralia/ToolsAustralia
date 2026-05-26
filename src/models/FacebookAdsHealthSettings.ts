import mongoose, { Document, Schema } from "mongoose";

/**
 * Singleton settings document for the Facebook Ads Health verdict engine.
 * One document with scope='global'. Lazy-initialised with defaults on first read.
 */
export interface IFacebookAdsHealthSettings extends Document {
  scope: "global";
  breakevenRoas: number;
  targetCpaAud: number;
  zeroConvSpendMultiplier: number;
  roasDropTriggerPct: number;
  postEditWaitHours: number;
  updatedBy?: mongoose.Types.ObjectId;
  updatedAt: Date;
}

const FacebookAdsHealthSettingsSchema = new Schema<IFacebookAdsHealthSettings>(
  {
    scope: { type: String, enum: ["global"], required: true, unique: true },
    breakevenRoas: { type: Number, required: true, default: 1.0 },
    targetCpaAud: { type: Number, required: true, default: 40 },
    zeroConvSpendMultiplier: { type: Number, required: true, default: 2.0 },
    roasDropTriggerPct: { type: Number, required: true, default: 25 },
    postEditWaitHours: { type: Number, required: true, default: 72 },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

export const FACEBOOK_ADS_HEALTH_SETTINGS_DEFAULTS = {
  scope: "global" as const,
  breakevenRoas: 1.0,
  targetCpaAud: 40,
  zeroConvSpendMultiplier: 2.0,
  roasDropTriggerPct: 25,
  postEditWaitHours: 72,
};

export default mongoose.models.FacebookAdsHealthSettings ||
  mongoose.model<IFacebookAdsHealthSettings>("FacebookAdsHealthSettings", FacebookAdsHealthSettingsSchema);
