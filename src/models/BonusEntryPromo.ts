import mongoose, { Document, Schema } from "mongoose";
import { convertUTCToAEST } from "@/utils/common/timezone";

/**
 * Bonus Entry Promo Model
 *
 * This model represents date-based promotional campaigns that grant bonus entries
 * when users purchase packages during specific date ranges.
 *
 * Unlike the multiplier promo system, this system grants a fixed number of bonus
 * entries rather than multiplying existing entries.
 */
export interface IBonusEntryPromo extends Document {
  type: "membership-packages" | "one-time-packages" | "mini-packages";
  bonusEntries: number; // Number of bonus entries to grant
  startDate: Date; // Start date/time in UTC (stored as UTC, represents AEST time)
  endDate: Date; // End date/time in UTC (stored as UTC, represents AEST time)
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  description?: string; // Optional admin notes
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  isCurrentlyActive(): boolean; // Check if promo is active based on current AEST time
  isActiveAtDate(purchaseDate: Date): boolean; // Check if promo was active at a specific purchase date
}

const BonusEntryPromoSchema = new Schema<IBonusEntryPromo>(
  {
    type: {
      type: String,
      enum: ["membership-packages", "one-time-packages", "mini-packages"],
      required: [true, "Promo type is required"],
    },
    bonusEntries: {
      type: Number,
      required: [true, "Bonus entries amount is required"],
      min: [1, "Bonus entries must be at least 1"],
    },
    startDate: {
      type: Date,
      required: [true, "Start date is required"],
    },
    endDate: {
      type: Date,
      required: [true, "End date is required"],
      validate: {
        validator: function (this: IBonusEntryPromo, endDate: Date) {
          return endDate > this.startDate;
        },
        message: "End date must be after start date",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator is required"],
    },
    description: {
      type: String,
      required: false,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
// Compound index for finding active promos by type and date range
BonusEntryPromoSchema.index({ type: 1, isActive: 1, startDate: 1, endDate: 1 });
// Index for date range queries
BonusEntryPromoSchema.index({ startDate: 1, endDate: 1 });

/**
 * Check if promo is currently active based on current AEST time
 * Compares current AEST time with startDate and endDate (which are stored as UTC but represent AEST times)
 */
BonusEntryPromoSchema.methods.isCurrentlyActive = function (this: IBonusEntryPromo): boolean {
  if (!this.isActive) return false;

  const now = new Date();
  // Dates are stored as UTC but represent AEST times, so we can compare directly
  // The startDate and endDate were converted from AEST to UTC when created
  return now >= this.startDate && now <= this.endDate;
};

/**
 * Check if promo was active at a specific purchase date
 * Used during payment processing to determine if bonus entries should be granted
 *
 * @param purchaseDate - Purchase date in UTC (from payment metadata)
 * @returns true if purchase was made during promo period
 */
BonusEntryPromoSchema.methods.isActiveAtDate = function (this: IBonusEntryPromo, purchaseDate: Date): boolean {
  if (!this.isActive) return false;

  // Compare purchase date with promo date range
  // Both dates are in UTC, representing AEST times
  return purchaseDate >= this.startDate && purchaseDate <= this.endDate;
};

/**
 * Static method to get active promo for a specific type at a purchase date
 * Used during payment processing to find applicable bonus entry promos
 *
 * @param type - Package type (membership-packages, one-time-packages, mini-packages)
 * @param purchaseDate - Purchase date in UTC (from payment metadata)
 * @returns Active promo if found, null otherwise
 */
BonusEntryPromoSchema.statics.getActivePromoByType = async function (
  type: "membership-packages" | "one-time-packages" | "mini-packages",
  purchaseDate: Date
) {
  return this.findOne({
    type,
    isActive: true,
    startDate: { $lte: purchaseDate },
    endDate: { $gte: purchaseDate },
  }).sort({ createdAt: -1 }); // Get most recent if multiple match
};

/**
 * Static method to get all active promos (for admin display)
 * Returns promos that are currently active based on current AEST time
 */
BonusEntryPromoSchema.statics.getCurrentlyActivePromos = async function () {
  const now = new Date();
  return this.find({
    isActive: true,
    startDate: { $lte: now },
    endDate: { $gte: now },
  }).sort({ createdAt: -1 });
};

// Add static method types
interface BonusEntryPromoModel extends mongoose.Model<IBonusEntryPromo> {
  getActivePromoByType(
    type: "membership-packages" | "one-time-packages" | "mini-packages",
    purchaseDate: Date
  ): Promise<IBonusEntryPromo | null>;
  getCurrentlyActivePromos(): Promise<IBonusEntryPromo[]>;
}

const BonusEntryPromo =
  (mongoose.models.BonusEntryPromo as BonusEntryPromoModel) ||
  mongoose.model<IBonusEntryPromo, BonusEntryPromoModel>("BonusEntryPromo", BonusEntryPromoSchema);

export default BonusEntryPromo;
