import mongoose, { Document, Schema } from "mongoose";
import type { PromoMultiplier } from "@/types/promo-multiplier";
import { PROMO_MULTIPLIERS } from "@/types/promo-multiplier";

export type ScheduledPromoType = "membership-packages" | "one-time-packages" | "mini-packages";
export type ScheduledPromoMultiplier = PromoMultiplier;

/**
 * Scheduled Promo Model
 *
 * Date-based multiplier phases per package type. Resolution order:
 * Scheduled (if now in range) → Toggle Promo → Alternating → null.
 */
export interface IScheduledPromo extends Document {
  type: ScheduledPromoType;
  multiplier: ScheduledPromoMultiplier;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  name?: string;
  description?: string;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ScheduledPromoSchema = new Schema<IScheduledPromo>(
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
      required: [true, "Start date is required"],
    },
    endDate: {
      type: Date,
      required: [true, "End date is required"],
      validate: {
        validator: function (this: IScheduledPromo, endDate: Date) {
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
    name: {
      type: String,
      required: false,
      maxlength: [200, "Name cannot exceed 200 characters"],
    },
    description: {
      type: String,
      required: false,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    deletedAt: {
      type: Date,
      required: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index for "current phase by type" queries (resolver)
ScheduledPromoSchema.index({ type: 1, isActive: 1, startDate: 1, endDate: 1 });
// Index for list/date filters
ScheduledPromoSchema.index({ startDate: 1, endDate: 1 });

/**
 * Get the active scheduled promo for a type at a given date.
 * Used by resolver; excludes soft-deleted (deletedAt set or isActive false).
 */
ScheduledPromoSchema.statics.getActiveByTypeAndDate = async function (
  type: ScheduledPromoType,
  date: Date
): Promise<IScheduledPromo | null> {
  return this.findOne({
    type,
    isActive: true,
    deletedAt: { $in: [null, undefined] },
    startDate: { $lte: date },
    endDate: { $gte: date },
  }).sort({ createdAt: -1 });
};

interface ScheduledPromoModel extends mongoose.Model<IScheduledPromo> {
  getActiveByTypeAndDate(type: ScheduledPromoType, date: Date): Promise<IScheduledPromo | null>;
}

const ScheduledPromo =
  (mongoose.models.ScheduledPromo as ScheduledPromoModel) ||
  mongoose.model<IScheduledPromo, ScheduledPromoModel>("ScheduledPromo", ScheduledPromoSchema);

export default ScheduledPromo;
