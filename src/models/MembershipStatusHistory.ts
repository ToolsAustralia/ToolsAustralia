import mongoose, { Document, Schema } from "mongoose";
import type { MembershipAnalyticsActor, MembershipNormalizedStatus } from "@/types/admin/membershipAnalytics";

export interface IMembershipStatusHistory extends Document {
  userId: mongoose.Types.ObjectId;
  effectiveAt: Date;
  // `paused` is the app-owned retention-pause state (the 30-day `pause_30d` cancellation-flow
  // offer). It is NOT part of the Stripe-derived `MembershipNormalizedStatus` union, so it is
  // appended here rather than in that shared analytics type. See docs/subscription/models.md.
  membershipStatus: MembershipNormalizedStatus | "paused";
  actor: MembershipAnalyticsActor;
  /** e.g. webhook_invoice_payment_failed_renewal, cancel_api_user, cancel_api_admin */
  source: string;
  dedupeKey?: string;
  subscriptionPackageId?: string;
  autoRenew?: boolean;
  endDate?: Date;
  cancelledAt?: Date;
  pastDueAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const MembershipStatusHistorySchema = new Schema<IMembershipStatusHistory>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    effectiveAt: { type: Date, required: true, index: true },
    membershipStatus: {
      type: String,
      required: true,
      enum: [
        "active",
        "trialing",
        "past_due",
        "unpaid",
        "canceled",
        "scheduled_cancel",
        "incomplete",
        "incomplete_expired",
        "none",
        // Retention `pause_30d` freeze (app-owned; not a Stripe-native status). See RetentionPauseService.
        "paused",
      ],
    },
    actor: {
      type: String,
      required: true,
      enum: ["user", "admin", "stripe", "system"],
    },
    source: { type: String, required: true },
    dedupeKey: { type: String, sparse: true, unique: true },
    subscriptionPackageId: { type: String },
    autoRenew: { type: Boolean },
    endDate: { type: Date },
    cancelledAt: { type: Date },
    pastDueAt: { type: Date },
    metadata: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
    collection: "membershipstatushistories",
  }
);

MembershipStatusHistorySchema.index({ userId: 1, effectiveAt: -1 });
MembershipStatusHistorySchema.index({ userId: 1, membershipStatus: 1, effectiveAt: -1 });

export default mongoose.models.MembershipStatusHistory ||
  mongoose.model<IMembershipStatusHistory>("MembershipStatusHistory", MembershipStatusHistorySchema);
