import mongoose, { Document, Schema } from "mongoose";

export type CommissionType = "one-time-package" | "upsell" | "membership-first" | "membership-recurring";
export type CommissionStatus = "pending" | "paid" | "cancelled";

export interface IAffiliateCommission extends Document {
  affiliateId: mongoose.Types.ObjectId; // Links to Affiliate model
  referredUserId: mongoose.Types.ObjectId; // User who was referred
  commissionType: CommissionType;
  status: CommissionStatus;

  // Purchase details
  purchaseType: "one-time" | "upsell" | "membership";
  packageId?: string;
  packageName?: string;
  purchaseAmount: number; // Amount in cents
  commissionRate: number; // Commission rate (0.30 for 30%)
  commissionAmount: number; // Calculated commission in cents

  // Stripe payment tracking
  stripePaymentIntentId?: string;
  stripeInvoiceId?: string; // For recurring membership payments
  stripeSubscriptionId?: string; // For membership tracking

  // Flags to prevent duplicate commissions
  isFirstTimePurchase: boolean; // Only first-time purchases count for one-time/upsell
  isRecurringPayment: boolean; // For membership recurring payments

  // Payout tracking
  payoutId?: mongoose.Types.ObjectId; // Links to AffiliatePayout when marked as paid

  // Timestamps
  earnedAt: Date; // When commission was earned
  paidAt?: Date; // When commission was paid out
  createdAt: Date;
  updatedAt: Date;
}

const AffiliateCommissionSchema = new Schema<IAffiliateCommission>(
  {
    affiliateId: {
      type: Schema.Types.ObjectId,
      ref: "Affiliate",
      required: true,
    },
    referredUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    commissionType: {
      type: String,
      enum: ["one-time-package", "upsell", "membership-first", "membership-recurring"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "paid", "cancelled"],
      default: "pending",
    },
    purchaseType: {
      type: String,
      enum: ["one-time", "upsell", "membership"],
      required: true,
    },
    packageId: {
      type: String,
      trim: true,
    },
    packageName: {
      type: String,
      trim: true,
    },
    purchaseAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    commissionRate: {
      type: Number,
      required: true,
      default: 0.30, // 30% commission
      min: 0,
      max: 1,
    },
    commissionAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    stripePaymentIntentId: {
      type: String,
      trim: true,
    },
    stripeInvoiceId: {
      type: String,
      trim: true,
    },
    stripeSubscriptionId: {
      type: String,
      trim: true,
    },
    isFirstTimePurchase: {
      type: Boolean,
      default: true,
    },
    isRecurringPayment: {
      type: Boolean,
      default: false,
    },
    payoutId: {
      type: Schema.Types.ObjectId,
      ref: "AffiliatePayout",
    },
    earnedAt: {
      type: Date,
      default: Date.now,
    },
    paidAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    strict: true,
  }
);

// Indexes for performance and preventing duplicates
AffiliateCommissionSchema.index({ affiliateId: 1, status: 1 });
AffiliateCommissionSchema.index({ referredUserId: 1 });
AffiliateCommissionSchema.index({ stripePaymentIntentId: 1 }, { sparse: true });
AffiliateCommissionSchema.index({ stripeInvoiceId: 1 }, { sparse: true });
AffiliateCommissionSchema.index({ stripeSubscriptionId: 1 }, { sparse: true });
AffiliateCommissionSchema.index({ payoutId: 1 }, { sparse: true });
// Prevent duplicate commissions for same payment
AffiliateCommissionSchema.index(
  { affiliateId: 1, referredUserId: 1, stripePaymentIntentId: 1, commissionType: 1 },
  { unique: true, sparse: true }
);
// Prevent duplicate recurring commissions
AffiliateCommissionSchema.index(
  { affiliateId: 1, referredUserId: 1, stripeInvoiceId: 1, commissionType: 1 },
  { unique: true, sparse: true }
);

// Clear any cached model to ensure schema changes take effect
if (mongoose.models.AffiliateCommission) {
  delete mongoose.models.AffiliateCommission;
}

export default mongoose.model<IAffiliateCommission>("AffiliateCommission", AffiliateCommissionSchema);


