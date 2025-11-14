/**
 * Timezone Utility Functions
 *
 * All dates are stored in UTC in the database.
 * All display dates are shown in AEST (Australian Eastern Standard Time - UTC+10).
 *
 * IMPORTANT: AEST is UTC+10 (standard time)
 *            AEDT is UTC+11 (daylight saving time)
 *
 * Australia observes daylight saving from first Sunday in October to first Sunday in April.
 * For this implementation, we use AEST consistently as specified.
 */

import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";
import { addDays, addMinutes } from "date-fns";

// AEST timezone identifier
const AEST_TIMEZONE = "Australia/Sydney"; // Sydney follows AEST/AEDT

/**
 * Convert a UTC date to AEST
 * @param utcDate - Date in UTC
 * @returns Date object in AEST timezone
 */
export function convertUTCToAEST(utcDate: Date): Date {
  return toZonedTime(utcDate, AEST_TIMEZONE);
}

/**
 * Convert an AEST date to UTC for database storage
 * @param aestDate - Date in AEST timezone
 * @returns Date object in UTC
 */
export function convertAESTToUTC(aestDate: Date): Date {
  return fromZonedTime(aestDate, AEST_TIMEZONE);
}

/**
 * Format a UTC date as AEST string
 * @param utcDate - Date in UTC
 * @param formatString - Format string (default: 'yyyy-MM-dd HH:mm:ss')
 * @returns Formatted date string in AEST
 */
export function formatDateInAEST(utcDate: Date, formatString: string = "yyyy-MM-dd HH:mm:ss"): string {
  return formatInTimeZone(utcDate, AEST_TIMEZONE, formatString);
}

/**
 * Resolve the timezone that should be used for local display on the current device.
 * We only call `Intl.DateTimeFormat` inside the function to avoid SSR pitfalls.
 *
 * @param fallback - Fallback timezone string when the browser cannot provide one.
 */
export function resolveLocalDisplayTimeZone(fallback: string = "UTC"): string {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return resolved || fallback;
  } catch {
    // On the server (or older browsers) we won't have locale info, so fall back to UTC.
    return fallback;
  }
}

/**
 * Convert a UTC date to the viewer's local timezone.
 *
 * @param utcDate - Date stored in UTC.
 * @param timeZone - Optional timezone override (useful for testing).
 * @returns Date object in the specified local timezone.
 */
export function convertUTCToLocal(utcDate: Date, timeZone?: string): Date {
  const zone = timeZone || resolveLocalDisplayTimeZone();
  return toZonedTime(utcDate, zone);
}

/**
 * Convert a local date (from the viewer) to UTC for storage.
 *
 * @param localDate - Date object created in the local timezone.
 * @param timeZone - Optional timezone override (defaults to detected zone).
 * @returns Date converted to UTC.
 */
export function convertLocalToUTC(localDate: Date, timeZone?: string): Date {
  const zone = timeZone || resolveLocalDisplayTimeZone();
  return fromZonedTime(localDate, zone);
}

/**
 * Format a UTC date string using the viewer's local timezone.
 *
 * @param utcDate - Date stored in UTC.
 * @param formatString - Desired output format.
 * @param timeZone - Optional timezone override (defaults to detected zone).
 */
export function formatDateInLocal(
  utcDate: Date,
  formatString: string = "dd MMM yyyy, hh:mm a",
  timeZone?: string
): string {
  const zone = timeZone || resolveLocalDisplayTimeZone();
  return formatInTimeZone(utcDate, zone, formatString);
}

/**
 * Format a UTC date as human-readable AEST string
 * Example: "Sept 30, 2024 8:00 PM AEST"
 * @param utcDate - Date in UTC
 * @returns Human-readable date string in AEST
 */
export function formatDateReadable(utcDate: Date): string {
  return formatInTimeZone(utcDate, AEST_TIMEZONE, "MMM dd, yyyy h:mm a 'AEST'");
}

/**
 * Get current date/time in AEST
 * @returns Current Date object in AEST timezone
 */
export function getNowInAEST(): Date {
  return toZonedTime(new Date(), AEST_TIMEZONE);
}

/**
 * Get current date/time in UTC (for database queries)
 * @returns Current Date object in UTC
 */
export function getNowInUTC(): Date {
  return new Date();
}

/**
 * Create a specific AEST date/time and convert to UTC for storage
 * Used when admin creates a major draw with AEST times
 *
 * @param year - Year (e.g., 2024)
 * @param month - Month (1-12, NOT 0-11)
 * @param day - Day of month
 * @param hour - Hour in 24-hour format (0-23)
 * @param minute - Minute (0-59)
 * @returns Date object in UTC for database storage
 *
 * @example
 * // Create Sept 30, 2024 8:00 PM AEST
 * const drawDate = createAESTDateAsUTC(2024, 9, 30, 20, 0);
 */
export function createAESTDateAsUTC(
  year: number,
  month: number,
  day: number,
  hour: number = 0,
  minute: number = 0
): Date {
  // Create date in AEST timezone
  const dateString = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(
    2,
    "0"
  )}:${String(minute).padStart(2, "0")}:00`;
  const aestDate = fromZonedTime(dateString, AEST_TIMEZONE);
  return aestDate;
}

/**
 * Calculate freeze time (30 minutes before draw date)
 * @param drawDateUTC - Draw date in UTC
 * @returns Freeze time in UTC (30 minutes before draw)
 */
export function calculateFreezeTime(drawDateUTC: Date): Date {
  return addMinutes(drawDateUTC, -30);
}

/**
 * Calculate activation date (midnight after draw date in AEST)
 * If draw is Sept 30, 8:00 PM AEST, activation is Oct 1, 12:00 AM AEST
 *
 * @param drawDateUTC - Draw date in UTC
 * @returns Activation date in UTC (midnight after draw in AEST)
 */
export function calculateActivationDate(drawDateUTC: Date): Date {
  // Convert draw date to AEST
  const drawDateAEST = toZonedTime(drawDateUTC, AEST_TIMEZONE);

  // Get the next day at midnight AEST
  const nextDayAEST = new Date(
    drawDateAEST.getFullYear(),
    drawDateAEST.getMonth(),
    drawDateAEST.getDate() + 1,
    0, // midnight
    0,
    0
  );

  // Convert back to UTC for storage
  return fromZonedTime(nextDayAEST, AEST_TIMEZONE);
}

/**
 * Calculate next draw date (30 days after start date, at 8:00 PM AEST)
 * Used for 30-day rolling cycle
 *
 * @param startDateUTC - Start date of current draw in UTC
 * @returns Next draw date in UTC (30 days later at 8:00 PM AEST)
 */
export function calculateNextDrawDate(startDateUTC: Date): Date {
  // Convert to AEST
  const startDateAEST = toZonedTime(startDateUTC, AEST_TIMEZONE);

  // Add 30 days
  const nextDrawDateAEST = addDays(startDateAEST, 30);

  // Set time to 8:00 PM AEST
  const nextDrawAt8PM = new Date(
    nextDrawDateAEST.getFullYear(),
    nextDrawDateAEST.getMonth(),
    nextDrawDateAEST.getDate(),
    20, // 8 PM
    0,
    0
  );

  // Convert back to UTC
  return fromZonedTime(nextDrawAt8PM, AEST_TIMEZONE);
}

/**
 * Calculate when to create next queued draw (7 days before current draw date)
 * @param currentDrawDateUTC - Current draw date in UTC
 * @returns Date when next draw should be created (7 days before, at midnight AEST)
 */
export function calculateNextDrawCreationDate(currentDrawDateUTC: Date): Date {
  // Convert to AEST
  const drawDateAEST = toZonedTime(currentDrawDateUTC, AEST_TIMEZONE);

  // Go back 7 days
  const creationDateAEST = addDays(drawDateAEST, -7);

  // Set to midnight AEST
  const creationAtMidnight = new Date(
    creationDateAEST.getFullYear(),
    creationDateAEST.getMonth(),
    creationDateAEST.getDate(),
    0, // midnight
    0,
    0
  );

  // Convert back to UTC
  return fromZonedTime(creationAtMidnight, AEST_TIMEZONE);
}

/**
 * Check if current time is within freeze period
 * @param freezeEntriesAtUTC - Freeze time in UTC
 * @param drawDateUTC - Draw date in UTC
 * @returns true if currently in freeze period
 */
export function isInFreezePeriod(freezeEntriesAtUTC: Date, drawDateUTC: Date): boolean {
  const now = new Date();
  return now >= freezeEntriesAtUTC && now < drawDateUTC;
}

/**
 * Check if a payment was created before freeze period
 * Used to determine if entries should go to current or next draw
 *
 * @param paymentCreatedTimestamp - Stripe payment intent created timestamp (Unix milliseconds)
 * @param freezeEntriesAtUTC - Freeze time in UTC
 * @returns true if payment was created before freeze
 */
export function wasPaymentBeforeFreeze(paymentCreatedTimestamp: number, freezeEntriesAtUTC: Date): boolean {
  const paymentCreatedDate = new Date(paymentCreatedTimestamp); // Already in milliseconds
  return paymentCreatedDate < freezeEntriesAtUTC;
}

/**
 * Get time remaining until freeze period starts
 * @param freezeEntriesAtUTC - Freeze time in UTC
 * @returns Milliseconds until freeze, or 0 if already frozen
 */
export function getTimeUntilFreeze(freezeEntriesAtUTC: Date): number {
  const now = new Date();
  const timeRemaining = freezeEntriesAtUTC.getTime() - now.getTime();
  return Math.max(0, timeRemaining);
}

/**
 * Get time remaining until draw date
 * @param drawDateUTC - Draw date in UTC
 * @returns Milliseconds until draw, or 0 if draw has passed
 */
export function getTimeUntilDraw(drawDateUTC: Date): number {
  const now = new Date();
  const timeRemaining = drawDateUTC.getTime() - now.getTime();
  return Math.max(0, timeRemaining);
}

/**
 * Format milliseconds as human-readable countdown
 * Example: "2 hours 15 minutes" or "45 minutes 30 seconds"
 *
 * @param milliseconds - Time in milliseconds
 * @returns Human-readable countdown string
 */
export function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];

  if (hours > 0) {
    parts.push(`${hours} hour${hours !== 1 ? "s" : ""}`);
  }

  if (minutes > 0 || hours > 0) {
    parts.push(`${minutes} minute${minutes !== 1 ? "s" : ""}`);
  }

  if (parts.length === 0 || (hours === 0 && minutes < 5)) {
    // Show seconds only if less than 5 minutes remaining
    parts.push(`${seconds} second${seconds !== 1 ? "s" : ""}`);
  }

  return parts.join(" ");
}

/**
 * Validate that draw dates are in correct order
 * @param startDate - Start date
 * @param freezeEntriesAt - Freeze date
 * @param drawDate - Draw date
 * @param activationDate - Activation date
 * @returns Validation result with error message if invalid
 */
export function validateDrawDates(
  startDate: Date,
  freezeEntriesAt: Date,
  drawDate: Date,
  activationDate: Date
): { valid: boolean; error?: string } {
  if (startDate >= freezeEntriesAt) {
    return { valid: false, error: "Start date must be before freeze date" };
  }

  if (freezeEntriesAt >= drawDate) {
    return { valid: false, error: "Freeze date must be before draw date" };
  }

  if (drawDate >= activationDate) {
    return { valid: false, error: "Draw date must be before activation date" };
  }

  return { valid: true };
}
