import mongoose, { Document, Schema } from "mongoose";
import type { MilestoneType } from "@/models/MilestoneReward";

export type MilestoneIssuanceStatus = "active" | "redeemed" | "expired" | "cancelled";

export interface IMilestoneIssuance extends Document {
  milestoneRewardId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  milestoneType: MilestoneType;
  thresholdReached: number;
  achievementCycle: number;
  entriesAmount: number;
  status: MilestoneIssuanceStatus;
  issuedAt: Date;
  redeemedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MilestoneIssuanceSchema = new Schema<IMilestoneIssuance>(
  {
    milestoneRewardId: {
      type: Schema.Types.ObjectId,
      ref: "MilestoneReward",
      required: [true, "milestoneRewardId is required"],
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "userId is required"],
      index: true,
    },
    milestoneType: {
      type: String,
      enum: ["spend-amount", "entries-gained", "loyalty-days"],
      required: [true, "milestoneType is required"],
      index: true,
    },
    thresholdReached: {
      type: Number,
      required: [true, "thresholdReached is required"],
      min: [1, "thresholdReached must be at least 1"],
    },
    achievementCycle: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    entriesAmount: {
      type: Number,
      required: [true, "entriesAmount is required"],
      min: [1, "entriesAmount must be at least 1"],
    },
    status: {
      type: String,
      enum: ["active", "redeemed", "expired", "cancelled"],
      default: "active",
      index: true,
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
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

MilestoneIssuanceSchema.index({ milestoneRewardId: 1, userId: 1, achievementCycle: 1 }, { unique: true });
MilestoneIssuanceSchema.index({ userId: 1, status: 1, issuedAt: -1 });

const MilestoneIssuance =
  (mongoose.models.MilestoneIssuance as mongoose.Model<IMilestoneIssuance>) ||
  mongoose.model<IMilestoneIssuance>("MilestoneIssuance", MilestoneIssuanceSchema);

export default MilestoneIssuance;
