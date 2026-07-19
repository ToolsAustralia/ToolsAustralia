import mongoose, { Document, Schema } from "mongoose";
import type { MilestoneType } from "@/models/MilestoneReward";

export type MilestoneIssuanceStatus = "active" | "redeemed" | "expired" | "cancelled" | "revoked" | "backfilled";

export interface IMilestoneIssuance extends Document {
  milestoneRewardId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  milestoneType: MilestoneType;
  thresholdReached: number;
  achievementCycle: number;
  /** Membership Streak generation this issuance belongs to (User.subscription.streakGeneration
   *  at issue time; 1 for non-streak milestone types). Scopes re-earning after a streak reset. */
  streakGeneration: number;
  entriesAmount: number;
  status: MilestoneIssuanceStatus;
  issuedAt: Date;
  redeemedAt?: Date;
  revokedAt?: Date;
  revocationReason?: string;
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
      enum: ["spend-amount", "entries-gained", "loyalty-days", "streak-months"],
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
    streakGeneration: {
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
      // "backfilled" = achieved before the streak feature launched — visible as
      // completed in the UI, blocks re-issuance, granted ZERO entries (spec §3).
      enum: ["active", "redeemed", "expired", "cancelled", "revoked", "backfilled"],
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
    revokedAt: {
      type: Date,
    },
    revocationReason: {
      type: String,
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

// Uniqueness is per streak generation so rungs are re-earnable after a full
// lapse → resubscribe reset (generation bump). The legacy 3-field unique index
// (milestoneRewardId, userId, achievementCycle) must be DROPPED in the DB when
// this ships — scripts/seed-streak-milestone-rewards.ts step 0 does it.
MilestoneIssuanceSchema.index(
  { milestoneRewardId: 1, userId: 1, streakGeneration: 1, achievementCycle: 1 },
  { unique: true }
);
MilestoneIssuanceSchema.index({ userId: 1, status: 1, issuedAt: -1 });

const MilestoneIssuance =
  (mongoose.models.MilestoneIssuance as mongoose.Model<IMilestoneIssuance>) ||
  mongoose.model<IMilestoneIssuance>("MilestoneIssuance", MilestoneIssuanceSchema);

export default MilestoneIssuance;
