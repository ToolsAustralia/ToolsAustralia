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
  /** Toolset slug user was on before visiting this page (e.g. from Other Toolsets carousel) */
  referrerSlug?: string;
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
    referrerSlug: {
      type: String,
      required: false,
      trim: true,
      lowercase: true,
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
PromoAnalyticsVisitSchema.index({ referrerSlug: 1, slug: 1, timestamp: -1 });
PromoAnalyticsVisitSchema.index({ anonymousId: 1, timestamp: -1 });
PromoAnalyticsVisitSchema.index({ userId: 1, timestamp: -1 });

// TTL index: auto-delete visits older than 90 days to manage growth
PromoAnalyticsVisitSchema.index(
  { timestamp: 1 },
  {
    expireAfterSeconds: 90 * 24 * 60 * 60,
    name: "promo_analytics_visits_ttl",
  }
);

const modelName = "PromoAnalyticsVisit";
if (mongoose.models[modelName]) {
  delete mongoose.models[modelName];
}

export default mongoose.model<IPromoAnalyticsVisit>(modelName, PromoAnalyticsVisitSchema);
