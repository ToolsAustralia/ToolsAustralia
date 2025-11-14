import mongoose, { Document, Schema } from "mongoose";

export type ReferralStatus = "generated" | "pending" | "converted" | "expired" | "flagged";

export interface IReferralEvent extends Document {
  referrerId: mongoose.Types.ObjectId;
  referralCode: string;
  inviteeEmail?: string;
  inviteeName?: string;
  inviteeUserId?: mongoose.Types.ObjectId;
  status: ReferralStatus;
  referralToken?: string;
  qualifyingOrderId?: string;
  qualifyingOrderType?: "membership" | "one-time";
  conversionDate?: Date;
  referrerEntriesAwarded: number;
  referreeEntriesAwarded: number;
  createdAt: Date;
  updatedAt: Date;
}

const ReferralEventSchema = new Schema<IReferralEvent>(
  {
    referrerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    referralCode: {
      type: String,
      required: true,
      trim: true,
    },
    inviteeEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    inviteeName: {
      type: String,
      trim: true,
    },
    inviteeUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    status: {
      type: String,
      enum: ["generated", "pending", "converted", "expired", "flagged"],
      default: "generated",
      required: true,
    },
    referralToken: {
      type: String,
      trim: true,
    },
    qualifyingOrderId: {
      type: String,
      trim: true,
    },
    qualifyingOrderType: {
      type: String,
      enum: ["membership", "one-time"],
    },
    conversionDate: {
      type: Date,
    },
    referrerEntriesAwarded: {
      type: Number,
      default: 0,
      min: [0, "Referrer entries awarded cannot be negative"],
    },
    referreeEntriesAwarded: {
      type: Number,
      default: 0,
      min: [0, "Referral entries awarded cannot be negative"],
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

ReferralEventSchema.index({ referrerId: 1, status: 1 });
ReferralEventSchema.index({ referralCode: 1 });
ReferralEventSchema.index({ referralToken: 1 }, { sparse: true });
ReferralEventSchema.index({ referralCode: 1, inviteeUserId: 1 }, { unique: true, sparse: true });
ReferralEventSchema.index({ referralCode: 1, inviteeEmail: 1 }, { unique: true, sparse: true });
ReferralEventSchema.index({ inviteeUserId: 1, status: 1 }, { sparse: true });

if (mongoose.models.ReferralEvent) {
  delete mongoose.models.ReferralEvent;
}

export default mongoose.model<IReferralEvent>("ReferralEvent", ReferralEventSchema);
