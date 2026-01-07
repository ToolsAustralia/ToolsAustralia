/**
 * Promo Banner Text Service
 * 
 * Business logic for promo banner text scheduling and resolution.
 * All date operations use AEST timezone utilities.
 */

import PromoBannerText, { type IPromoBannerText, type RecurrencePattern } from "@/models/PromoBannerText";
import { getNowInAEST, convertUTCToAEST } from "@/utils/common/timezone";
import { formatInTimeZone } from "date-fns-tz";
import connectDB from "@/lib/mongodb";

const AEST_TIMEZONE = "Australia/Sydney";

export class PromoBannerTextService {
  /**
   * Check if a date matches a recurring pattern
   * @param pattern - The recurrence pattern to check
   * @param date - The date in AEST timezone
   * @returns True if date matches pattern
   */
  matchesRecurrencePattern(pattern: RecurrencePattern, date: Date): boolean {
    const dayName = formatInTimeZone(date, AEST_TIMEZONE, "EEEE").toLowerCase();

    if (pattern === "weekdays") {
      return ["monday", "tuesday", "wednesday", "thursday", "friday"].includes(dayName);
    } else if (pattern === "weekends") {
      return ["saturday", "sunday"].includes(dayName);
    } else {
      return dayName === pattern.toLowerCase();
    }
  }

  /**
   * Check if a one-time schedule is active for a given date
   * @param text - The promo banner text
   * @param date - The date in AEST timezone
   * @returns True if schedule is active
   */
  isOneTimeActive(text: IPromoBannerText, date: Date): boolean {
    if (text.scheduleType !== "one-time" || !text.startDate || !text.endDate) {
      return false;
    }

    // Convert UTC dates to AEST for comparison
    const startAEST = convertUTCToAEST(text.startDate);
    const endAEST = convertUTCToAEST(text.endDate);

    // Compare dates (ignore time, only compare dates)
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const startDateOnly = new Date(startAEST.getFullYear(), startAEST.getMonth(), startAEST.getDate());
    const endDateOnly = new Date(endAEST.getFullYear(), endAEST.getMonth(), endAEST.getDate());

    return dateOnly >= startDateOnly && dateOnly <= endDateOnly;
  }

  /**
   * Check if a recurring schedule is active for a given date
   * @param text - The promo banner text
   * @param date - The date in AEST timezone
   * @returns True if schedule is active
   */
  isRecurringActive(text: IPromoBannerText, date: Date): boolean {
    if (text.scheduleType !== "recurring" || !text.recurrencePattern) {
      return false;
    }

    // Check date boundaries if set
    if (text.startDate) {
      const startAEST = convertUTCToAEST(text.startDate);
      const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const startDateOnly = new Date(startAEST.getFullYear(), startAEST.getMonth(), startAEST.getDate());
      if (dateOnly < startDateOnly) return false;
    }

    if (text.endDate) {
      const endAEST = convertUTCToAEST(text.endDate);
      const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const endDateOnly = new Date(endAEST.getFullYear(), endAEST.getMonth(), endAEST.getDate());
      if (dateOnly > endDateOnly) return false;
    }

    // Check if day matches pattern
    return this.matchesRecurrencePattern(text.recurrencePattern, date);
  }

  /**
   * Resolve the active text from a list of texts
   * Returns the most recently created matching text
   * @param texts - Array of promo banner texts
   * @param date - The date in AEST timezone
   * @returns The active text or null
   */
  resolveActiveText(texts: IPromoBannerText[], date: Date): IPromoBannerText | null {
    const activeTexts = texts.filter((text) => {
      if (!text.isActive) return false;

      if (text.scheduleType === "one-time") {
        return this.isOneTimeActive(text, date);
      } else if (text.scheduleType === "recurring") {
        return this.isRecurringActive(text, date);
      }

      return false;
    });

    if (activeTexts.length === 0) return null;

    // Return most recently created (highest priority)
    return activeTexts.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  }

  /**
   * Get the currently active banner text
   * @param currentDate - Optional date in AEST (defaults to current AEST time)
   * @returns The active text or null
   */
  async getActiveBannerText(currentDate?: Date): Promise<IPromoBannerText | null> {
    await connectDB();

    const date = currentDate || getNowInAEST();

    // Fetch all active texts
    const texts = await PromoBannerText.find({ isActive: true })
      .sort({ createdAt: -1 }) // Most recent first
      .lean()
      .exec();

    return this.resolveActiveText(texts as unknown as IPromoBannerText[], date);
  }

  /**
   * Get all promo banner texts (for admin management)
   * @returns Array of all promo banner texts
   */
  async getAllBannerTexts(): Promise<IPromoBannerText[]> {
    await connectDB();

    const texts = await PromoBannerText.find()
      .populate("createdBy", "firstName lastName email")
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return texts as unknown as IPromoBannerText[];
  }

  /**
   * Create a new promo banner text
   * @param data - The text data
   * @param createdBy - The user ID creating the text
   * @returns The created text
   */
  async createBannerText(
    data: {
      text: string;
      scheduleType: "one-time" | "recurring";
      startDate?: Date;
      endDate?: Date;
      recurrencePattern?: RecurrencePattern;
      description?: string;
      isActive?: boolean;
    },
    createdBy: string
  ): Promise<IPromoBannerText> {
    await connectDB();

    const text = new PromoBannerText({
      ...data,
      createdBy,
      isActive: data.isActive ?? true,
    });

    return text.save();
  }

  /**
   * Update a promo banner text
   * @param id - The text ID
   * @param data - The update data
   * @returns The updated text or null if not found
   */
  async updateBannerText(
    id: string,
    data: {
      text?: string;
      scheduleType?: "one-time" | "recurring";
      startDate?: Date;
      endDate?: Date;
      recurrencePattern?: RecurrencePattern;
      description?: string;
      isActive?: boolean;
    }
  ): Promise<IPromoBannerText | null> {
    await connectDB();

    const text = await PromoBannerText.findByIdAndUpdate(id, data, { new: true, runValidators: true });

    return text;
  }

  /**
   * Delete a promo banner text
   * @param id - The text ID
   * @returns True if deleted, false if not found
   */
  async deleteBannerText(id: string): Promise<boolean> {
    await connectDB();

    const result = await PromoBannerText.findByIdAndDelete(id);

    return !!result;
  }
}

