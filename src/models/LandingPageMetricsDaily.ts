import mongoose, { Document, Schema } from "mongoose";

/** Per-focus slice of a row's totals (same metric set, cents). */
export interface ILandingFocusMetrics {
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  revenueCents: number;
}

/**
 * membership vs one-time split WITHIN a canonicalUrl row. Needed because
 * canonicalizeLandingUrl strips query strings, so ads landing on
 * `/promotions/x` and `/promotions/x?packages=one-time` share one row.
 * Absent on `unknown://` rows and on rows written before this feature —
 * readers treat those as the "unclassified" bucket.
 */
export interface ILandingPackagesFocusSplit {
  membership: ILandingFocusMetrics;
  "one-time": ILandingFocusMetrics;
}

/**
 * Materialized aggregate: spend and delivery metrics per canonical landing URL per day.
 */
export interface ILandingPageMetricsDaily extends Document {
  /**
   * Which ad platform produced this row (2026-07-29). Part of the unique key.
   *
   * Without it, two platforms' rollups for the same landing URL on the same day would
   * collide — and worse, `BrandPerformanceCard` sums every returned row matching
   * `/promotions/<slug>`, so unfiltered reads would blend Meta and TikTok spend into one
   * figure with no visual indication, dividing one platform's revenue by combined spend.
   * Every read and the delete-and-rebuild filter must pass a platform.
   */
  platform: "meta" | "tiktok";
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
  packagesFocus?: ILandingPackagesFocusSplit;
  computedAt: Date;
}

const FocusMetricsSchema = new Schema<ILandingFocusMetrics>(
  {
    spendCents: { type: Number, required: true, default: 0 },
    impressions: { type: Number, required: true, default: 0 },
    clicks: { type: Number, required: true, default: 0 },
    conversions: { type: Number, required: true, default: 0 },
    revenueCents: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const PackagesFocusSplitSchema = new Schema<ILandingPackagesFocusSplit>(
  {
    membership: { type: FocusMetricsSchema, required: true },
    "one-time": { type: FocusMetricsSchema, required: true },
  },
  { _id: false }
);

const LandingPageMetricsDailySchema = new Schema<ILandingPageMetricsDaily>(
  {
    // No default: an unstamped row is a bug, and defaulting to "meta" would hide it.
    platform: { type: String, required: true, enum: ["meta", "tiktok"] },
    adAccountId: { type: String, required: true, index: true },
    date: { type: String, required: true },
    canonicalUrl: { type: String, required: true },
    spendCents: { type: Number, required: true, default: 0 },
    impressions: { type: Number, required: true, default: 0 },
    clicks: { type: Number, required: true, default: 0 },
    conversions: { type: Number, default: 0 },
    revenueCents: { type: Number, default: 0 },
    adIds: { type: [String], default: [] },
    packagesFocus: { type: PackagesFocusSplitSchema, required: false },
    computedAt: { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// The old unique key omitted `platform`; the migration
// (scripts/migrations/2026-07-29-platform-scope-landing-page-metrics.ts) stamps existing
// rows and swaps the index. Leaving the old index in place would let one platform's
// recompute collide with another's row for the same URL and day.
LandingPageMetricsDailySchema.index(
  { platform: 1, adAccountId: 1, date: 1, canonicalUrl: 1 },
  { unique: true },
);
LandingPageMetricsDailySchema.index({ platform: 1, adAccountId: 1, date: 1 });

export default mongoose.models.LandingPageMetricsDaily ||
  mongoose.model<ILandingPageMetricsDaily>("LandingPageMetricsDaily", LandingPageMetricsDailySchema);
