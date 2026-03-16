import mongoose, { Document, Schema } from "mongoose";

export interface ISegmentSnapshot extends Document {
  campaignId: mongoose.Types.ObjectId;
  monthKey: string;
  targetingMode: "all-active-subscribers" | "manual-users" | "csv-users" | "dynamic-segment";
  totalCandidates: number;
  totalEligible: number;
  totalIssued: number;
  includedUserIds: mongoose.Types.ObjectId[];
  excludedUserIds: mongoose.Types.ObjectId[];
  metadata?: {
    uploadedFileName?: string;
    issuedBy?: string;
    notes?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const SegmentSnapshotSchema = new Schema<ISegmentSnapshot>(
  {
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: "MonthlyEntryCampaign",
      required: true,
      index: true,
    },
    monthKey: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}$/, "monthKey must be in YYYY-MM format"],
      trim: true,
    },
    targetingMode: {
      type: String,
      enum: ["all-active-subscribers", "manual-users", "csv-users", "dynamic-segment"],
      required: true,
    },
    totalCandidates: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    totalEligible: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    totalIssued: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    includedUserIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    excludedUserIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    metadata: {
      uploadedFileName: { type: String, trim: true },
      issuedBy: { type: String, trim: true },
      notes: { type: String, trim: true, maxlength: 1000 },
    },
  },
  {
    timestamps: true,
  }
);

SegmentSnapshotSchema.index({ campaignId: 1, createdAt: -1 });
SegmentSnapshotSchema.index({ monthKey: 1, targetingMode: 1, createdAt: -1 });

const SegmentSnapshot =
  (mongoose.models.SegmentSnapshot as mongoose.Model<ISegmentSnapshot>) ||
  mongoose.model<ISegmentSnapshot>("SegmentSnapshot", SegmentSnapshotSchema);

export default SegmentSnapshot;
