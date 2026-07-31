import mongoose, { Document, Schema } from "mongoose";

/**
 * PromoAnalyticsVisit Model
 *
 * Tracks promotion page visits for attribution analytics.
 * Aggregated by slug for Admin Promo Analytics dashboard.
 *
 * @see docs/PROMO_PAGE_ANALYTICS.md
 */

export type PromoPageType = "evergreen" | "toolset";

export interface IPromoAnalyticsVisit extends Document {
  _id: mongoose.Types.ObjectId;
  pageType: PromoPageType;
  slug: string;
  /**
   * Where this row's UTM values came from: the durable first-touch `_ta_attr` cookie, or the
   * landing URL. Audit column — lets an attribution shift after a deploy be attributed to the
   * precedence change rather than to a real traffic change. Absent on rows written before it.
   */
  utmBasis?: "first_touch" | "landing_url";
  /** Prize the visitor assembled in "Build your prize" (e.g. "makita-kincrome", "cash-prize"). */
  builtPrizeSlug?: string;
  /** How many times they changed the toolbox lane on this page. Counts REEL touches only. */
  toolboxSwitches?: number;
  /** How many times they changed the power-toolset lane on this page. */
  toolsetSwitches?: number;
  /**
   * Did the visitor touch the builder at all on this page?
   *
   * Distinct from the two counters, and NOT derivable from them: cash is a toggle rather than a
   * reel card, so a cash-only visitor sits at 0/0 yet made a real choice. `builtPrizeSlug` is now
   * recorded for every visitor (it answers "what was on screen"), so this flag is what answers
   * "did they engage" — the two questions were previously conflated in the field's presence.
   */
  buildInteracted?: boolean;
  anonymousId?: string;
  userId?: mongoose.Types.ObjectId;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  timestamp: Date;
}

const PromoAnalyticsVisitSchema = new Schema<IPromoAnalyticsVisit>(
  {
    pageType: {
      type: String,
      required: [true, "Page type is required"],
      enum: ["evergreen", "toolset"],
    },
    slug: {
      type: String,
      required: [true, "Slug is required"],
      trim: true,
      lowercase: true,
    },
    utmBasis: {
      type: String,
      enum: ["first_touch", "landing_url"],
      required: false,
    },
    builtPrizeSlug: {
      type: String,
      required: false,
      trim: true,
      lowercase: true,
    },
    toolboxSwitches: {
      type: Number,
      required: false,
      min: 0,
    },
    toolsetSwitches: {
      type: Number,
      required: false,
      min: 0,
    },
    buildInteracted: {
      type: Boolean,
      required: false,
    },
    anonymousId: {
      type: String,
      required: false,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    referrer: {
      type: String,
      required: false,
      trim: true,
    },
    utmSource: {
      type: String,
      required: false,
      trim: true,
    },
    utmMedium: {
      type: String,
      required: false,
      trim: true,
    },
    utmCampaign: {
      type: String,
      required: false,
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  {
    timestamps: false,
    collection: "promoanalyticsvisits",
  }
);

// Indexes for efficient analytics queries
PromoAnalyticsVisitSchema.index({ pageType: 1, slug: 1, timestamp: -1 });
// `referrerSlug` and its index are gone: the field measured arrivals from the "Explore other
// toolsets" carousel, which the in-place two-reel configurator replaced on 2026-07-22. Nothing
// has written it since, so the metric was a structural zero. Dropping the declaration does NOT
// drop the index in Mongo — scripts/migrations/2026-07-31-promo-analytics-cleanup.ts does that.
PromoAnalyticsVisitSchema.index({ anonymousId: 1, timestamp: -1 });
PromoAnalyticsVisitSchema.index({ userId: 1, timestamp: -1 });
// PARTIAL, not plain (panel F-021). Every query that uses this index filters
// `builtPrizeSlug: { $exists: true }`, and a NON-sparse index stores a missing field as `null`,
// so those bounds come back as the entire key space (`[MinKey, "") ("", MaxKey]`) and the scan
// reads every row in the window. Measured on dev (764 docs, 8 carrying the field): the plain index
// examined 764 keys / 764 docs — identical to having no index at all. With this partial index the
// planner picks it unprompted and examines 8 keys / 8 docs. No `hint` needed, and none should be
// added: a hint naming an absent index 500s the whole admin route (F-020).
// The NAME must differ from the superseded `builtPrizeSlug_1_timestamp_-1`: mongoose cannot alter
// an index in place — re-declaring the same NAME with a changed `partialFilterExpression` is
// rejected by the server (measured: code 86, "An existing index has the same name as the requested
// index"; commonly cited as IndexOptionsConflict/85), and autoIndex swallows it, so the index would
// silently never build. A *differently named* partial index may coexist with the old one, so the
// deploy and the migration below are safe in either order.
// Superseded index dropped by scripts/migrations/2026-07-29-partial-build-prize-indexes.ts.
PromoAnalyticsVisitSchema.index(
  { builtPrizeSlug: 1, timestamp: -1 },
  { name: "builtPrizeSlug_ts_partial", partialFilterExpression: { builtPrizeSlug: { $exists: true } } }
);

/**
 * How long a visit row survives.
 *
 * Exported because the read side MUST know it. `User` and `PaymentEvent` never expire, so a
 * requested window that starts before this floor divides COMPLETE signups and revenue by
 * TRUNCATED visits — "All Time" would render conversion rates in the hundreds of percent, and a
 * page retired before the floor would show `visits 0 / revenue $12,000`. The analytics range
 * resolver clamps to this so every number on the tab comes from one population.
 */
export const PROMO_VISIT_RETENTION_DAYS = 90;

// TTL index: auto-delete visits older than PROMO_VISIT_RETENTION_DAYS to manage growth
PromoAnalyticsVisitSchema.index(
  { timestamp: 1 },
  {
    expireAfterSeconds: PROMO_VISIT_RETENTION_DAYS * 24 * 60 * 60,
    name: "promo_analytics_visits_ttl",
  }
);

const modelName = "PromoAnalyticsVisit";
if (mongoose.models[modelName]) {
  delete mongoose.models[modelName];
}

export default mongoose.model<IPromoAnalyticsVisit>(modelName, PromoAnalyticsVisitSchema);
