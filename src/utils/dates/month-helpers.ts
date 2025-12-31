/**
 * Month comparison and date range utilities
 */

import { startOfMonth, endOfMonth, subMonths, format } from "date-fns";

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
 * @param startDate - Start date
 * @param endDate - End date
 * @returns Array of dates (one per day)
 */
export function getDaysInRange(startDate: Date, endDate: Date): Date[] {
  const days: Date[] = [];
  const current = new Date(startDate);
  
  while (current <= endDate) {
    days.push(new Date(current));
    current.setDate(current.getDate() + 1);
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

