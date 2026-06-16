import mongoose, { Document, Schema } from "mongoose";

export type CommissionType =
  | "one-time-package"
  | "upsell"
  | "membership-first"
  | "membership-recurring"
  | "mini-draw-package";
export type CommissionStatus = "pending" | "paid" | "cancelled";

export interface IAffiliateCommission extends Document {
  affiliateId: mongoose.Types.ObjectId; // Links to Affiliate model
  referredUserId: mongoose.Types.ObjectId; // User who was referred
  commissionType: CommissionType;
  status: CommissionStatus;

  // Purchase details
  purchaseType: "one-time" | "upsell" | "membership" | "mini-draw";
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
  isFirstTimePurchase: boolean; // Legacy: membership-first uses true; lifetime commissions use false for repeat purchases
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
      enum: ["one-time-package", "upsell", "membership-first", "membership-recurring", "mini-draw-package"],
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "paid", "cancelled"],
      default: "pending",
    },
    purchaseType: {
      type: String,
      enum: ["one-time", "upsell", "membership", "mini-draw"],
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
// Prevent duplicate commissions for the same payment *intent* (one-time / first / upsell).
// IMPORTANT: membership-recurring rows use stripeInvoiceId only — they must NOT participate in this
// unique key, or every recurring row with no PI collides on stripePaymentIntentId: null (E11000).
AffiliateCommissionSchema.index(
  { affiliateId: 1, referredUserId: 1, stripePaymentIntentId: 1, commissionType: 1 },
  {
    unique: true,
    name: "uniq_affiliate_referred_pi_commission_partial",
    partialFilterExpression: {
      stripePaymentIntentId: { $exists: true, $type: "string" },
    },
  }
);
// Prevent duplicate recurring commissions (invoice-keyed rows only).
// IMPORTANT: must be PARTIAL, not sparse. A compound `sparse` index still indexes a
// document when ANY key is present — and affiliateId is always present — so every
// PI-based commission (no stripeInvoiceId → null) collided on
// (affiliateId, referredUserId, null, commissionType), meaning a referred user could
// only ever have ONE one-time / upsell / mini-draw commission. The partial filter
// indexes only rows that actually carry a string stripeInvoiceId (membership-recurring),
// matching the PI index above. (Mirror of the 2026-01 fix to the PI index.)
AffiliateCommissionSchema.index(
  { affiliateId: 1, referredUserId: 1, stripeInvoiceId: 1, commissionType: 1 },
  {
    unique: true,
    name: "uniq_affiliate_referred_invoice_commission_partial",
    partialFilterExpression: { stripeInvoiceId: { $exists: true, $type: "string" } },
  }
);

// Clear any cached model to ensure schema changes take effect
if (mongoose.models.AffiliateCommission) {
  delete mongoose.models.AffiliateCommission;
}

export default mongoose.model<IAffiliateCommission>("AffiliateCommission", AffiliateCommissionSchema);


