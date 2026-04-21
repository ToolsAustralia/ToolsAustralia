import mongoose, { Document, Schema } from "mongoose";
import type { PromoMultiplier } from "@/types/promo-multiplier";
import { PROMO_MULTIPLIERS } from "@/types/promo-multiplier";

export interface IPromo extends Document {
  type: "membership-packages" | "one-time-packages" | "mini-packages";
  multiplier: PromoMultiplier;
  startDate?: Date; // Optional - kept for backward compatibility but not used in toggle system
  endDate?: Date; // Optional - kept for backward compatibility but not used in toggle system
  duration?: number; // Optional - in hours, kept for backward compatibility
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PromoSchema = new Schema<IPromo>(
  {
    type: {
    type: String,
    enum: ["membership-packages", "one-time-packages", "mini-packages"],
      required: [true, "Promo type is required"],
    },
    multiplier: {
      type: Number,
      enum: [...PROMO_MULTIPLIERS],
      required: [true, "Multiplier is required"],
    },
    startDate: {
      type: Date,
      required: false, // Optional - kept for backward compatibility
    },
    endDate: {
      type: Date,
      required: false, // Optional - kept for backward compatibility
    },
    duration: {
      type: Number,
      required: false, // Optional - kept for backward compatibility
      min: [1, "Duration must be at least 1 hour"],
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
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
PromoSchema.index({ type: 1, isActive: 1 });
PromoSchema.index({ endDate: 1 });

// Virtual to check if promo has expired (deprecated - dates no longer used in toggle system)
PromoSchema.virtual("isExpired").get(function (this: IPromo) {
  if (!this.endDate) return false; // No expiration if no end date
  return new Date() > this.endDate;
});

// Method to deactivate promo
PromoSchema.methods.deactivate = async function (this: IPromo) {
  this.isActive = false;
  await this.save();
};

// Static method to get active promos (updated for toggle system - ignores dates)
PromoSchema.statics.getActivePromos = async function () {
  return this.find({
    isActive: true,
  }).sort({ createdAt: -1 });
};

// Static method to get active promo by type (updated for toggle system - ignores dates)
PromoSchema.statics.getActivePromoByType = async function (
  type: "membership-packages" | "one-time-packages" | "mini-packages"
) {
  return this.findOne({
    type,
    isActive: true,
  }).sort({ createdAt: -1 });
};

// Middleware removed - no longer auto-deactivating based on dates in toggle system
// Promos are now managed via toggle endpoint only

const Promo = mongoose.models.Promo || mongoose.model<IPromo>("Promo", PromoSchema);

export default Promo;
