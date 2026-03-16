import mongoose, { Document, Schema } from "mongoose";

export type RedeemableIssuanceStatus = "active" | "redeemed" | "expired" | "cancelled";

export interface IRedeemableIssuance extends Document {
  campaignId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  monthKey: string;
  code?: string;
  status: RedeemableIssuanceStatus;
  source: "monthly-coupon";
  entriesAmount: number;
  metadata?: {
    targetingMode?: string;
    segmentReason?: string;
    issuedBy?: string;
  };
  issuedAt: Date;
  redeemedAt?: Date;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const RedeemableIssuanceSchema = new Schema<IRedeemableIssuance>(
  {
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: "MonthlyEntryCampaign",
      required: [true, "campaignId is required"],
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "userId is required"],
      index: true,
    },
    monthKey: {
      type: String,
      required: [true, "monthKey is required"],
      match: [/^\d{4}-\d{2}$/, "monthKey must be in YYYY-MM format"],
      trim: true,
    },
    code: {
      type: String,
      uppercase: true,
      trim: true,
      match: [/^(?=.{6,32}$)[A-Z0-9]+(?:-[A-Z0-9]+)*$/, "Invalid issuance code format"],
    },
    status: {
      type: String,
      enum: ["active", "redeemed", "expired", "cancelled"],
      default: "active",
      index: true,
    },
    source: {
      type: String,
      enum: ["monthly-coupon"],
      default: "monthly-coupon",
      required: true,
    },
    entriesAmount: {
      type: Number,
      required: [true, "entriesAmount is required"],
      min: [1, "entriesAmount must be at least 1"],
    },
    metadata: {
      targetingMode: { type: String },
      segmentReason: { type: String },
      issuedBy: { type: String },
    },
    issuedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    redeemedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
      required: [true, "expiresAt is required"],
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

RedeemableIssuanceSchema.index({ campaignId: 1, userId: 1 }, { unique: true });
RedeemableIssuanceSchema.index({ campaignId: 1, code: 1 }, { unique: true, sparse: true });
RedeemableIssuanceSchema.index({ userId: 1, status: 1, expiresAt: 1 });
RedeemableIssuanceSchema.index({ monthKey: 1, status: 1 });

const RedeemableIssuance =
  (mongoose.models.RedeemableIssuance as mongoose.Model<IRedeemableIssuance>) ||
  mongoose.model<IRedeemableIssuance>("RedeemableIssuance", RedeemableIssuanceSchema);

export default RedeemableIssuance;
