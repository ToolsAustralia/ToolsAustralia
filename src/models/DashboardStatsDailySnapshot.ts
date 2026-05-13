import mongoose, { Document, Schema } from "mongoose";

export const DASHBOARD_STATS_SNAPSHOT_SOURCE_VERSION = 1;

export type RevenueBucketKey =
  | "membershipPurchase"
  | "membershipRenewal"
  | "oneTimePurchase"
  | "additionalOneTimePurchase"
  | "miniDraw"
  | "upsell";

export const REVENUE_BUCKET_KEYS: RevenueBucketKey[] = [
  "membershipPurchase",
  "membershipRenewal",
  "oneTimePurchase",
  "additionalOneTimePurchase",
  "miniDraw",
  "upsell",
];

export interface IRevenueBucket {
  revenue: number;
  purchaseCount: number;
}

export interface IAdChannelMetrics {
  spend: number;
  revenue: number;
  roas: number;
  impressions?: number;
  clicks?: number;
}

export interface IDashboardStatsDailySnapshot extends Document {
  date: string; // YYYY-MM-DD in Australia/Sydney
  tz: "Australia/Sydney";
  revenue: {
    total: number;
    buckets: Map<RevenueBucketKey, IRevenueBucket>;
  };
  users: {
    newSignups: number;
    cancellationsInDay: number;
  };
  adChannels: Map<string, IAdChannelMetrics>;
  confidence: "live";
  computedAt: Date;
  sourceVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const RevenueBucketSchema = new Schema<IRevenueBucket>(
  {
    revenue: { type: Number, required: true, default: 0 },
    purchaseCount: { type: Number, required: true, default: 0 },
  },
  { _id: false }
);

const AdChannelMetricsSchema = new Schema<IAdChannelMetrics>(
  {
    spend: { type: Number, required: true, default: 0 },
    revenue: { type: Number, required: true, default: 0 },
    roas: { type: Number, required: true, default: 0 },
    impressions: { type: Number },
    clicks: { type: Number },
  },
  { _id: false }
);

const DashboardStatsDailySnapshotSchema = new Schema<IDashboardStatsDailySnapshot>(
  {
    date: { type: String, required: true, unique: true, index: true },
    tz: { type: String, required: true, default: "Australia/Sydney" },
    revenue: {
      total: { type: Number, required: true, default: 0 },
      buckets: { type: Map, of: RevenueBucketSchema, required: true, default: () => new Map() },
    },
    users: {
      newSignups: { type: Number, required: true, default: 0 },
      cancellationsInDay: { type: Number, required: true, default: 0 },
    },
    adChannels: { type: Map, of: AdChannelMetricsSchema, required: true, default: () => new Map() },
    confidence: { type: String, required: true, enum: ["live"] },
    computedAt: { type: Date, required: true },
    sourceVersion: { type: Number, required: true, default: DASHBOARD_STATS_SNAPSHOT_SOURCE_VERSION },
  },
  {
    timestamps: true,
    collection: "dashboardstatsdailysnapshots",
  }
);

export default (mongoose.models.DashboardStatsDailySnapshot as mongoose.Model<IDashboardStatsDailySnapshot>) ||
  mongoose.model<IDashboardStatsDailySnapshot>("DashboardStatsDailySnapshot", DashboardStatsDailySnapshotSchema);
