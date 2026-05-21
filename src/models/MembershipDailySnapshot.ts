import mongoose, { Document, Schema } from "mongoose";

export const SNAPSHOT_SOURCE_VERSION = 1;

export interface IMembershipDailySnapshot extends Document {
  date: string;
  packageId: string;
  tz: "Australia/Sydney";
  activeCount: number;
  pastDueCount: number;
  scheduledCancelCount: number;
  cancelledCount: number;
  unitPriceCents: number;
  activeRevenue: number;
  pastDueRevenue: number;
  confidence: "live";
  computedAt: Date;
  sourceVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const MembershipDailySnapshotSchema = new Schema<IMembershipDailySnapshot>(
  {
    date: { type: String, required: true, index: true },
    packageId: { type: String, required: true },
    tz: { type: String, required: true, default: "Australia/Sydney" },
    activeCount: { type: Number, required: true, default: 0 },
    pastDueCount: { type: Number, required: true, default: 0 },
    scheduledCancelCount: { type: Number, required: true, default: 0 },
    cancelledCount: { type: Number, required: true, default: 0 },
    unitPriceCents: { type: Number, required: true, default: 0 },
    activeRevenue: { type: Number, required: true, default: 0 },
    pastDueRevenue: { type: Number, required: true, default: 0 },
    confidence: { type: String, required: true, enum: ["live"] },
    computedAt: { type: Date, required: true },
    sourceVersion: { type: Number, required: true, default: SNAPSHOT_SOURCE_VERSION },
  },
  {
    timestamps: true,
    collection: "membershipdailysnapshots",
  }
);

MembershipDailySnapshotSchema.index({ date: 1, packageId: 1 }, { unique: true });

export default (mongoose.models.MembershipDailySnapshot as mongoose.Model<IMembershipDailySnapshot>) ||
  mongoose.model<IMembershipDailySnapshot>("MembershipDailySnapshot", MembershipDailySnapshotSchema);
