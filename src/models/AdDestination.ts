import mongoose, { Document, Schema } from "mongoose";

/** Ad platforms that can resolve a per-ad landing URL. Snapchat/Google join by adding a key. */
export type AdDestinationPlatform = "meta" | "tiktok";

/**
 * Resolved landing URL(s) for a single ad, for ANY ad platform.
 *
 * Previously `MetaAdDestination`. Renamed and platform-scoped 2026-07-29 so TikTok (and
 * later Snapchat) can share one collection, one aggregation service and one set of reader
 * queries instead of forking all of them per platform.
 *
 * ## Why `platform` is load-bearing, not decorative
 *
 * The old unique key was a BARE `adId`. Ad ids are only unique WITHIN a platform — a TikTok
 * ad_id that numerically equals a Meta ad id would either throw E11000 (losing that ad's
 * destination, silently rebooking its spend to `unknown://`) or overwrite the Meta row.
 * Three readers also queried `find({ adId: { $in } })` with no platform filter, which would
 * cross-contaminate platforms. The unique key is now `{ platform, adId }` and every read
 * must pass a platform.
 *
 * ## Collection name is pinned deliberately
 *
 * `collection: "metaaddestinations"` keeps the EXISTING data in place across the rename.
 * Without the pin, Mongoose would derive `addestinations` from the new model name, silently
 * creating an empty collection — every Meta URL would resolve to `unknown://` overnight.
 * The historical name is a small price for a zero-downtime rename; do not "tidy" it without
 * a data migration.
 */
export interface IAdDestination extends Document {
  /** Which ad platform this ad belongs to. Part of the unique key. */
  platform: AdDestinationPlatform;
  /** Meta `act_…` id or TikTok advertiser_id. */
  adAccountId: string;
  adId: string;
  /** Primary destination used for spend attribution (first link when multiple) */
  canonicalUrl: string;
  /** All URLs discovered on the creative (Meta carousel cards, TikTok Smart+ URL list, …) */
  rawUrls: string[];
  /** True when more than one distinct landing URL exists */
  multiUrl: boolean;
  creativeType: string;
  /** UI grouping: video vs static/link vs carousel */
  adFormat: "video" | "static" | "carousel" | "unknown";
  fetchedAt: Date;
}

const AdDestinationSchema = new Schema<IAdDestination>(
  {
    // No default: an unstamped row is a bug, and defaulting to "meta" would hide it.
    platform: { type: String, required: true, enum: ["meta", "tiktok"] },
    adAccountId: { type: String, required: true, index: true },
    adId: { type: String, required: true },
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
  { timestamps: false, collection: "metaaddestinations" },
);

// The unique key. The old bare `adId_1` unique index must be DROPPED by the migration
// (scripts/migrations/2026-07-29-platform-scope-ad-destinations.ts) — leaving it in place
// keeps the cross-platform collision alive regardless of this definition.
AdDestinationSchema.index({ platform: 1, adId: 1 }, { unique: true });
AdDestinationSchema.index({ platform: 1, adAccountId: 1, canonicalUrl: 1 });

export default mongoose.models.AdDestination ||
  mongoose.model<IAdDestination>("AdDestination", AdDestinationSchema);
