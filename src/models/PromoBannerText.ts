import mongoose, { Document, Schema } from "mongoose";
import { getNowInAEST, convertUTCToAEST } from "@/utils/common/timezone";
import { formatInTimeZone } from "date-fns-tz";

const AEST_TIMEZONE = "Australia/Sydney";

export type ScheduleType = "one-time" | "recurring";
export type RecurrencePattern =
  | "weekdays"
  | "weekends"
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

/**
 * Promo Banner Text Model
 *
 * This model represents scheduled banner text that can be displayed
 * on the promo banner. Supports both one-time date ranges and recurring
 * schedules (weekdays, weekends, or specific days of the week).
 *
 * All dates are stored in UTC but represent AEST/AEDT times.
 */
export interface IPromoBannerText extends Document {
  text: string; // The banner text to display
  scheduleType: ScheduleType; // "one-time" | "recurring"
  
  // For one-time schedules (required when scheduleType is "one-time")
  startDate?: Date; // Start date stored as UTC, represents AEST time
  endDate?: Date; // End date stored as UTC, represents AEST time
  
  // For recurring schedules (required when scheduleType is "recurring")
  recurrencePattern?: RecurrencePattern; // Day pattern for recurring schedules
  
  isActive: boolean;
  createdBy: mongoose.Types.ObjectId;
  description?: string; // Optional admin notes
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  isCurrentlyActive(): boolean; // Check if current AEST date matches schedule
}

const PromoBannerTextSchema = new Schema<IPromoBannerText>(
  {
    text: {
      type: String,
      required: [true, "Text is required"],
      trim: true,
      maxlength: [100, "Text cannot exceed 100 characters"],
    },
    scheduleType: {
      type: String,
      enum: ["one-time", "recurring"],
      required: [true, "Schedule type is required"],
    },
    startDate: {
      type: Date,
      required: function (this: IPromoBannerText) {
        return this.scheduleType === "one-time";
      },
    },
    endDate: {
      type: Date,
      required: function (this: IPromoBannerText) {
        return this.scheduleType === "one-time";
      },
      validate: {
        validator: function (this: IPromoBannerText, endDate: Date) {
          if (this.scheduleType === "one-time" && this.startDate) {
            // Allow same day (start date = end date) for single-day promotions
            return endDate >= this.startDate;
          }
          return true;
        },
        message: "End date must be on or after start date",
      },
    },
    recurrencePattern: {
      type: String,
      enum: ["weekdays", "weekends", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
      required: function (this: IPromoBannerText) {
        return this.scheduleType === "recurring";
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
PromoBannerTextSchema.index({ startDate: 1, endDate: 1, isActive: 1, scheduleType: 1, recurrencePattern: 1 });
PromoBannerTextSchema.index({ isActive: 1, scheduleType: 1 });
PromoBannerTextSchema.index({ createdAt: -1 }); // For priority resolution (most recent first)

/**
 * Check if promo banner text is currently active based on current AEST date
 * Handles both one-time and recurring schedules
 */
PromoBannerTextSchema.methods.isCurrentlyActive = function (this: IPromoBannerText): boolean {
  if (!this.isActive) return false;

  const nowAEST = getNowInAEST();

  if (this.scheduleType === "one-time") {
    if (!this.startDate || !this.endDate) return false;
    
    // Convert UTC dates to AEST for comparison
    const startAEST = convertUTCToAEST(this.startDate);
    const endAEST = convertUTCToAEST(this.endDate);
    
    // Compare dates (ignore time, only compare dates)
    const nowDate = new Date(nowAEST.getFullYear(), nowAEST.getMonth(), nowAEST.getDate());
    const startDate = new Date(startAEST.getFullYear(), startAEST.getMonth(), startAEST.getDate());
    const endDate = new Date(endAEST.getFullYear(), endAEST.getMonth(), endAEST.getDate());
    
    return nowDate >= startDate && nowDate <= endDate;
  } else if (this.scheduleType === "recurring") {
    if (!this.recurrencePattern) return false;
    
    // Check date boundaries if set
    if (this.startDate) {
      const startAEST = convertUTCToAEST(this.startDate);
      const nowDate = new Date(nowAEST.getFullYear(), nowAEST.getMonth(), nowAEST.getDate());
      const startDate = new Date(startAEST.getFullYear(), startAEST.getMonth(), startAEST.getDate());
      if (nowDate < startDate) return false;
    }
    
    if (this.endDate) {
      const endAEST = convertUTCToAEST(this.endDate);
      const nowDate = new Date(nowAEST.getFullYear(), nowAEST.getMonth(), nowAEST.getDate());
      const endDate = new Date(endAEST.getFullYear(), endAEST.getMonth(), endAEST.getDate());
      if (nowDate > endDate) return false;
    }
    
    // Get day name in AEST timezone
    const dayName = formatInTimeZone(nowAEST, AEST_TIMEZONE, "EEEE").toLowerCase();
    
    // Check if day matches pattern
    if (this.recurrencePattern === "weekdays") {
      return ["monday", "tuesday", "wednesday", "thursday", "friday"].includes(dayName);
    } else if (this.recurrencePattern === "weekends") {
      return ["saturday", "sunday"].includes(dayName);
    } else {
      return dayName === this.recurrencePattern.toLowerCase();
    }
  }

  return false;
};

const PromoBannerText =
  mongoose.models.PromoBannerText || mongoose.model<IPromoBannerText>("PromoBannerText", PromoBannerTextSchema);

export default PromoBannerText;

