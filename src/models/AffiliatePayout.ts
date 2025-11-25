import mongoose, { Document, Schema } from "mongoose";

export interface IAffiliatePayout extends Document {
  affiliateId: mongoose.Types.ObjectId; // Links to Affiliate model
  totalAmount: number; // Total payout amount in cents
  commissionCount: number; // Number of commissions included in this payout
  processedBy: mongoose.Types.ObjectId; // Admin user ID who processed the payout
  notes?: string; // Optional notes from admin
  paidAt: Date; // When payout was processed
  createdAt: Date;
  updatedAt: Date;
}

const AffiliatePayoutSchema = new Schema<IAffiliatePayout>(
  {
    affiliateId: {
      type: Schema.Types.ObjectId,
      ref: "Affiliate",
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    commissionCount: {
      type: Number,
      required: true,
      min: 0,
    },
    processedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [500, "Notes cannot be more than 500 characters"],
    },
    paidAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

// Indexes for performance
AffiliatePayoutSchema.index({ affiliateId: 1, paidAt: -1 });
AffiliatePayoutSchema.index({ processedBy: 1 });

// Clear any cached model to ensure schema changes take effect
if (mongoose.models.AffiliatePayout) {
  delete mongoose.models.AffiliatePayout;
}

export default mongoose.model<IAffiliatePayout>("AffiliatePayout", AffiliatePayoutSchema);

