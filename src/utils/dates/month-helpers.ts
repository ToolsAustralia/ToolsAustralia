/**
 * Month comparison and date range utilities
 */

import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { createAESTDateAsUTC } from "@/utils/common/timezone";

const AEST_TIMEZONE = "Australia/Sydney";

/**
 * Get start and end dates for a month
 * @param monthString - Month in YYYY-MM format
 * @returns Object with start and end dates
 */
export function getMonthDateRange(monthString: string): { start: Date; end: Date } {
  const [year, month] = monthString.split("-").map(Number);
  const monthDate = new Date(year, month - 1, 1);
  
  return {
    start: startOfMonth(monthDate),
    end: endOfMonth(monthDate),
  };
}

/**
 * Get previous month string in YYYY-MM format
 * @param monthString - Current month in YYYY-MM format
 * @returns Previous month in YYYY-MM format
 */
export function getPreviousMonth(monthString: string): string {
  const [year, month] = monthString.split("-").map(Number);
  const monthDate = new Date(year, month - 1, 1);
  const previousMonthDate = subMonths(monthDate, 1);
  
  return format(previousMonthDate, "yyyy-MM");
}

/**
 * Get all days in a date range
 * @param startDate - Start date (will be interpreted in AEST timezone)
 * @param endDate - End date (will be interpreted in AEST timezone)
 * @returns Array of dates (one per day, normalized to AEST midnight UTC)
 */
export function getDaysInRange(startDate: Date, endDate: Date): Date[] {
  const days: Date[] = [];
  
  // Get AEST date components for start date
  const startYear = parseInt(formatInTimeZone(startDate, AEST_TIMEZONE, "yyyy"), 10);
  const startMonth = parseInt(formatInTimeZone(startDate, AEST_TIMEZONE, "M"), 10);
  const startDay = parseInt(formatInTimeZone(startDate, AEST_TIMEZONE, "d"), 10);
  
  // Get AEST date components for end date
  const endYear = parseInt(formatInTimeZone(endDate, AEST_TIMEZONE, "yyyy"), 10);
  const endMonth = parseInt(formatInTimeZone(endDate, AEST_TIMEZONE, "M"), 10);
  const endDay = parseInt(formatInTimeZone(endDate, AEST_TIMEZONE, "d"), 10);
  
  // Create dates in AEST and iterate day by day
  let currentYear = startYear;
  let currentMonth = startMonth;
  let currentDay = startDay;
  
  while (
    currentYear < endYear ||
    (currentYear === endYear && currentMonth < endMonth) ||
    (currentYear === endYear && currentMonth === endMonth && currentDay <= endDay)
  ) {
    // Create date for this day in AEST (converted to UTC for storage)
    const dayDate = createAESTDateAsUTC(currentYear, currentMonth, currentDay, 0, 0);
    days.push(dayDate);
    
    // Move to next day in AEST by adding 1 day to the UTC date and getting AEST components
    const nextDate = new Date(dayDate);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    
    // Get next day's AEST components
    currentYear = parseInt(formatInTimeZone(nextDate, AEST_TIMEZONE, "yyyy"), 10);
    currentMonth = parseInt(formatInTimeZone(nextDate, AEST_TIMEZONE, "M"), 10);
    currentDay = parseInt(formatInTimeZone(nextDate, AEST_TIMEZONE, "d"), 10);
  }
  
  return days;
}

/**
 * Format date to YYYY-MM-DD string
 * @param date - Date to format
 * @returns Formatted date string
 */
export function formatDateString(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

