/**
 * Alternating Multiplier Manager Utility
 * 
 * Manages alternating multipliers when no active promo exists.
 * Alternates once per day (AEST) between two configured multipliers.
 * Uses date-based deterministic seed to ensure consistency across all users.
 * All users will see the same multiplier on the same day (AEST).
 */

import { formatInTimeZone } from "date-fns-tz";

// AEST/AEDT timezone identifier (matches timezone.ts)
const AEST_TIMEZONE = "Australia/Sydney";

/**
 * Get the alternating multiplier for the current day (AEST)
 * Uses day-of-year as deterministic seed - all users see the same multiplier on the same day
 * Alternates between two configured multipliers once per day
 * 
 * Algorithm: Uses day-of-year (1-365/366) for guaranteed alternation
 * - Calculates the day number within the year (Jan 1 = day 1, Dec 31 = day 365/366)
 * - Uses modulo 2 to alternate between the two multipliers
 * - Guarantees consecutive days always alternate (Jan 31 → Feb 1 works perfectly)
 * 
 * This ensures:
 * 1. Consistency across all users on the same day
 * 2. True alternation that changes daily (guaranteed, not probabilistic)
 * 3. Works correctly across month boundaries (Jan 31 → Feb 1, Feb 28 → Mar 1, etc.)
 * 4. Works on both client and server-side
 * 
 * @param multipliers - Tuple of exactly 2 multipliers (e.g., [5, 10])
 * @returns The multiplier to use for today
 */
export function getAlternatingMultiplier(multipliers: [number, number]): number {
  try {
    const now = new Date();
    
    // Extract date components in AEST/AEDT timezone (not user's local timezone)
    // This ensures all users see the same multiplier on the same AEST day
    const year = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "yyyy"), 10);
    const month = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "M"), 10); // 1-12
    const day = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "d"), 10); // 1-31
    
    // Calculate day of year (1-365 or 366 for leap years) based on AEST date
    // This guarantees true alternation: consecutive days will always have different indices
    // Days in each month (non-leap year)
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    
    // Check if it's a leap year (divisible by 4, but not by 100 unless also by 400)
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    if (isLeapYear) {
      daysInMonth[1] = 29; // February has 29 days in leap year
    }
    
    // Sum days from previous months + current day
    // Note: month is 1-12, so we subtract 1 for array indexing
    let dayOfYear = day;
    for (let i = 0; i < month - 1; i++) {
      dayOfYear += daysInMonth[i];
    }
    
    // Use day-of-year modulo 2 to determine index (0 or 1)
    // This guarantees alternation: day 31 → index 0, day 32 → index 1
    // Example: Jan 31 = day 31 → (31-1) % 2 = 0 → first multiplier
    //          Feb 1 = day 32 → (32-1) % 2 = 1 → second multiplier
    const index = (dayOfYear - 1) % 2;
    
    return multipliers[index];
  } catch {
    // If any error, default to first multiplier
    return multipliers[0];
  }
}

