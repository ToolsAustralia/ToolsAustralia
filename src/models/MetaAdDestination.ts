import mongoose, { Document, Schema } from "mongoose";

/**
 * Resolved landing URL(s) per Meta ad (from Ad + Creative Graph API).
 * Refreshed when sync sees an ad_id or on periodic refresh.
 */
export interface IMetaAdDestination extends Document {
  adAccountId: string;
  adId: string;
  /** Primary destination used for spend attribution (first link when multiple) */
  canonicalUrl: string;
  /** All URLs discovered on the creative (carousel, etc.) */
  rawUrls: string[];
  /** True when more than one distinct landing URL exists */
  multiUrl: boolean;
  creativeType: string;
  /** UI grouping: video vs static/link vs carousel (from object_story_spec shape) */
  adFormat: "video" | "static" | "carousel" | "unknown";
  fetchedAt: Date;
}

const MetaAdDestinationSchema = new Schema<IMetaAdDestination>(
  {
    adAccountId: { type: String, required: true, index: true },
    adId: { type: String, required: true, unique: true },
    canonicalUrl: { type: String, required: true },
    rawUrls: { type: [String], default: [] },
    multiUrl: { type: Boolean, default: false },
    creativeType: { type: String, default: "unknown" },
    adFormat: {
      type: String,
      enum: ["video", "static", "carousel", "unknown"],
      default: "unknown",
    },
    fetchedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

MetaAdDestinationSchema.index({ adAccountId: 1, canonicalUrl: 1 });

export default mongoose.models.MetaAdDestination ||
  mongoose.model<IMetaAdDestination>("MetaAdDestination", MetaAdDestinationSchema);
