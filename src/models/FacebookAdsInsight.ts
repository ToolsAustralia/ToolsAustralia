import mongoose, { Document, Schema } from "mongoose";

/**
 * Facebook Ads Insight Model
 * Stores cached Facebook Marketing API insights data for performance tracking
 * 
 * This model caches ad performance data (spend, revenue, ROAS) fetched from
 * Facebook's Insights API to reduce API calls and improve response times.
 */
export interface IFacebookAdsInsight extends Document {
  adAccountId: string; // Format: act_123456789
  date: Date; // Date of the insight
  dateRange: {
    start: Date;
    end: Date;
  };
  level: "account" | "campaign" | "adset";
  breakdown?: {
    campaignId?: string;
    campaignName?: string;
    adsetId?: string;
    adsetName?: string;
  };
  metrics: {
    spend: number; // Ad spend in cents
    revenue: number; // Revenue from conversions (action_values)
    impressions: number;
    clicks: number;
    conversions: number; // Purchase count
  };
  calculated: {
    profit: number; // Revenue - Spend
    roas: number; // Revenue / Spend
    ctr: number; // Click-through rate (clicks / impressions * 100)
    cpc: number; // Cost per click (spend / clicks)
  };
  syncedAt: Date; // When data was fetched from Facebook
  createdAt: Date;
  updatedAt: Date;
}

const FacebookAdsInsightSchema = new Schema<IFacebookAdsInsight>(
  {
    adAccountId: {
      type: String,
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    dateRange: {
      start: {
        type: Date,
        required: true,
        index: true,
      },
      end: {
        type: Date,
        required: true,
        index: true,
      },
    },
    level: {
      type: String,
      required: true,
      enum: ["account", "campaign", "adset"],
      index: true,
    },
    breakdown: {
      campaignId: {
        type: String,
        required: false,
      },
      campaignName: {
        type: String,
        required: false,
      },
      adsetId: {
        type: String,
        required: false,
      },
      adsetName: {
        type: String,
        required: false,
      },
    },
    metrics: {
      spend: {
        type: Number,
        required: true,
        default: 0,
      },
      revenue: {
        type: Number,
        required: true,
        default: 0,
      },
      impressions: {
        type: Number,
        required: true,
        default: 0,
      },
      clicks: {
        type: Number,
        required: true,
        default: 0,
      },
      conversions: {
        type: Number,
        required: true,
        default: 0,
      },
    },
    calculated: {
      profit: {
        type: Number,
        required: true,
        default: 0,
      },
      roas: {
        type: Number,
        required: true,
        default: 0,
      },
      ctr: {
        type: Number,
        required: true,
        default: 0,
      },
      cpc: {
        type: Number,
        required: true,
        default: 0,
      },
    },
    syncedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "facebookadsinsights",
  }
);

// Compound indexes for efficient queries
// Find insights by account, date range, and level
FacebookAdsInsightSchema.index({ adAccountId: 1, date: -1, level: 1 });

// Find insights by date range
FacebookAdsInsightSchema.index({ "dateRange.start": -1, "dateRange.end": -1 });

// Find stale data for refresh (syncedAt older than cache TTL)
FacebookAdsInsightSchema.index({ syncedAt: -1 });

// Find insights by campaign/adset for breakdown views
FacebookAdsInsightSchema.index({ "breakdown.campaignId": 1, date: -1 });
FacebookAdsInsightSchema.index({ "breakdown.adsetId": 1, date: -1 });

// Clear cached model to ensure schema updates are applied
const modelName = "FacebookAdsInsight";
if (mongoose.models[modelName]) {
  delete mongoose.models[modelName];
}

export default mongoose.model<IFacebookAdsInsight>(modelName, FacebookAdsInsightSchema);
