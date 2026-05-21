import mongoose, { Document, Schema } from "mongoose";

export type MembershipRenewalCycleStatus = "expected" | "succeeded" | "failed" | "recovered";

export interface IMembershipRenewalCycle extends Document {
  stripeInvoiceId: string;
  userId: mongoose.Types.ObjectId;
  stripeSubscriptionId?: string;
  billingReason?: string;
  status: MembershipRenewalCycleStatus;
  /** Period end for this invoice (renewal due boundary), from Stripe invoice.period_end */
  dueAt: Date;
  amountDueCents: number;
  amountPaidCents?: number;
  succeededAt?: Date;
  failedAt?: Date;
  paymentIntentId?: string;
  confidence: "stripe" | "backfill";
  createdAt: Date;
  updatedAt: Date;
}

const MembershipRenewalCycleSchema = new Schema<IMembershipRenewalCycle>(
  {
    stripeInvoiceId: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    stripeSubscriptionId: { type: String, index: true },
    billingReason: { type: String },
    status: {
      type: String,
      required: true,
      enum: ["expected", "succeeded", "failed", "recovered"],
      index: true,
    },
    dueAt: { type: Date, required: true, index: true },
    amountDueCents: { type: Number, required: true, default: 0 },
    amountPaidCents: { type: Number },
    succeededAt: { type: Date },
    failedAt: { type: Date },
    paymentIntentId: { type: String },
    confidence: { type: String, enum: ["stripe", "backfill"], required: true, default: "stripe" },
  },
  {
    timestamps: true,
    collection: "membershiprenewalcycles",
  }
);

MembershipRenewalCycleSchema.index({ dueAt: 1, billingReason: 1, status: 1 });
MembershipRenewalCycleSchema.index({ userId: 1, dueAt: -1 });

export default mongoose.models.MembershipRenewalCycle ||
  mongoose.model<IMembershipRenewalCycle>("MembershipRenewalCycle", MembershipRenewalCycleSchema);
