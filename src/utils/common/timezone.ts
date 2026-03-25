/**
 * Timezone Utility Functions
 *
 * All dates are stored in UTC in the database.
 * All display dates are shown in Australia/Sydney timezone (AEST/AEDT).
 *
 * IMPORTANT: AEST is UTC+10 (standard time, April-October)
 *            AEDT is UTC+11 (daylight saving time, October-April)
 *
 * Australia observes daylight saving from first Sunday in October to first Sunday in April.
 * This implementation uses "Australia/Sydney" timezone identifier which automatically
 * handles DST transitions. The date-fns-tz library will correctly switch between
 * AEST and AEDT based on the date being processed.
 */

import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";
import { addDays, addMinutes } from "date-fns";

// AEST timezone identifier
const AEST_TIMEZONE = "Australia/Sydney"; // Sydney follows AEST/AEDT

/**
 * Website launch date: November 27, 2025 at 8pm AEDT/AEST
 * This is when the website was officially released
 * Stored as a Date object representing November 27, 2025, 8:00 PM in Australia/Sydney timezone
 */
export const WEBSITE_LAUNCH_DATE_AEST = new Date("2025-11-27T20:00:00+11:00"); // November 27, 2025, 8pm AEDT

/**
 * Get website launch date in UTC for database queries
 * Returns the start of November 27, 2025 (midnight AEST) converted to UTC
 * This is used for "all-time" date range queries
 */
export function getWebsiteLaunchDateUTC(): Date {
  // Get the date components from the launch date in AEST
  const year = 2025;
  const month = 11;
  const day = 27;
  // Return start of day (midnight) in AEST, converted to UTC
  return createAESTDateAsUTC(year, month, day, 0, 0);
}

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

function getOrdinalSuffixEn(day: number): string {
  if (day > 3 && day < 21) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

/**
 * One-line label for major draw live moment: weekday, ordinal date, month, 12h time, and AEST or AEDT.
 * Uses Australia/Sydney so daylight saving is correct. `utcDate` is the instant stored in UTC (e.g. from API).
 *
 * Example: "Friday, 27th March 3:00pm AEDT"
 */
export function formatMajorDrawLiveDateLineUtc(utcDate: Date): string {
  const tz = AEST_TIMEZONE;
  const weekday = formatInTimeZone(utcDate, tz, "EEEE");
  const dayNum = parseInt(formatInTimeZone(utcDate, tz, "d"), 10);
  const month = formatInTimeZone(utcDate, tz, "MMMM");
  const clock = `${formatInTimeZone(utcDate, tz, "h:mm")}${formatInTimeZone(utcDate, tz, "a").toLowerCase()}`;
  const tzAbbr =
    new Intl.DateTimeFormat("en-AU", { timeZone: tz, timeZoneName: "short" })
      .formatToParts(utcDate)
      .find((p) => p.type === "timeZoneName")?.value ?? "AEST";
  return `${weekday}, ${dayNum}${getOrdinalSuffixEn(dayNum)} ${month} ${clock} ${tzAbbr}`;
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
 * Format a UTC date as human-readable AEST/AEDT string
 * Automatically detects whether to show AEST or AEDT based on DST
 * Example: "Sept 30, 2024 8:30 PM AEST" or "Dec 15, 2024 8:30 PM AEDT"
 * @param utcDate - Date in UTC
 * @returns Human-readable date string with correct timezone abbreviation
 */
export function formatDateReadable(utcDate: Date): string {
  // Get the timezone abbreviation (AEST or AEDT) using Intl API for reliability
  // This ensures we get the correct abbreviation based on DST
  let timezoneAbbr: string;
  try {
    const formatter = new Intl.DateTimeFormat("en-AU", {
      timeZone: AEST_TIMEZONE,
      timeZoneName: "short",
    });
    const parts = formatter.formatToParts(utcDate);
    const tzPart = parts.find((part) => part.type === "timeZoneName");
    timezoneAbbr = tzPart?.value || "AEST"; // Fallback to AEST if not found
  } catch {
    // Fallback: check offset to determine AEST (UTC+10) vs AEDT (UTC+11)
    const zonedDate = toZonedTime(utcDate, AEST_TIMEZONE);
    const utcTime = utcDate.getTime();
    const zonedTime = zonedDate.getTime();
    const offsetHours = (utcTime - zonedTime) / (1000 * 60 * 60);
    timezoneAbbr = offsetHours === -10 ? "AEST" : "AEDT";
  }

  // Format the date with the correct timezone abbreviation
  return formatInTimeZone(utcDate, AEST_TIMEZONE, `MMM dd, yyyy h:mm a '${timezoneAbbr}'`);
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
 * Get start of today (midnight) in AEST timezone
 * Used for business day calculations (revenue, statistics, etc.)
 * This ensures "today" resets at midnight AEST, not UTC
 * @returns Date object representing midnight AEST today, converted to UTC for storage
 */
export function getStartOfTodayInAEST(): Date {
  const now = new Date();
  // Get current date components in AEST timezone
  const year = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "yyyy"), 10);
  const month = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "M"), 10);
  const day = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "d"), 10);

  // Create midnight AEST and convert to UTC for database queries
  return createAESTDateAsUTC(year, month, day, 0, 0);
}

/**
 * Get start of month (first day at midnight) in AEST timezone
 * Used for monthly business calculations
 * @returns Date object representing first day of current month at midnight AEST, converted to UTC
 */
export function getStartOfMonthInAEST(): Date {
  const now = new Date();
  // Get current date components in AEST timezone
  const year = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "yyyy"), 10);
  const month = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "M"), 10);

  // Create first day of month at midnight AEST and convert to UTC
  return createAESTDateAsUTC(year, month, 1, 0, 0);
}

/**
 * Get next midnight in AEST timezone
 * Used for countdown timers that reset at midnight AEST
 * This ensures countdowns align with Australian business day boundaries
 * @returns Date object representing next midnight AEST, converted to UTC
 */
export function getNextMidnightAEST(): Date {
  const now = new Date();
  // Get current date components in AEST timezone
  const year = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "yyyy"), 10);
  const month = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "M"), 10);
  const day = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "d"), 10);

  // Create today's midnight AEST
  const todayMidnight = createAESTDateAsUTC(year, month, day, 0, 0);

  // If we've already passed midnight AEST today, get tomorrow's midnight
  if (now >= todayMidnight) {
    // Add 1 day to today's date in AEST, then create tomorrow's midnight
    const tomorrowDate = addDays(now, 1);
    const tomorrowYear = parseInt(formatInTimeZone(tomorrowDate, AEST_TIMEZONE, "yyyy"), 10);
    const tomorrowMonth = parseInt(formatInTimeZone(tomorrowDate, AEST_TIMEZONE, "M"), 10);
    const tomorrowDay = parseInt(formatInTimeZone(tomorrowDate, AEST_TIMEZONE, "d"), 10);
    return createAESTDateAsUTC(tomorrowYear, tomorrowMonth, tomorrowDay, 0, 0);
  }

  return todayMidnight;
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
 * // Create Sept 30, 2024 8:30 PM AEST
 * const drawDate = createAESTDateAsUTC(2024, 9, 30, 20, 30);
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
 * Get window "today through 27th" in AEST: start = midnight today, end = 27th 20:00 (8pm AEST/AEDT).
 * Used for "renewing today through 27th" in admin upcoming renewals and projected income.
 */
export function getTodayThrough27thWindowUTC(): { startUTC: Date; endUTC: Date } {
  const startUTC = getStartOfTodayInAEST();
  const now = new Date();
  const year = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "yyyy"), 10);
  const month = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "M"), 10);
  const day = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "d"), 10);
  let anchorYear = year;
  let anchorMonth = month;
  if (day >= 27) {
    anchorMonth += 1;
    if (anchorMonth > 12) {
      anchorMonth = 1;
      anchorYear += 1;
    }
  }
  const endUTC = createAESTDateAsUTC(anchorYear, anchorMonth, 27, 20, 0);
  return { startUTC, endUTC };
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
 * If draw is Sept 30, 8:30 PM AEST, activation is Oct 1, 12:00 AM AEST
 *
 * @param drawDateUTC - Draw date in UTC
 * @returns Activation date in UTC (midnight after draw in AEST)
 */
export function calculateActivationDate(drawDateUTC: Date): Date {
  // Add one day - work in UTC by adding 24 hours, then get the AEST components of the result
  const nextDayUTC = addDays(drawDateUTC, 1);
  const nextYear = parseInt(formatInTimeZone(nextDayUTC, AEST_TIMEZONE, "yyyy"), 10);
  const nextMonth = parseInt(formatInTimeZone(nextDayUTC, AEST_TIMEZONE, "M"), 10);
  const nextDayNum = parseInt(formatInTimeZone(nextDayUTC, AEST_TIMEZONE, "d"), 10);

  // Create date string in AEST timezone format and convert to UTC
  return createAESTDateAsUTC(nextYear, nextMonth, nextDayNum, 0, 0);
}

/**
 * Normalize an activation date to midnight (12:00 AM) in AEST
 * Ensures that activation dates are always at midnight regardless of the input time
 *
 * @param activationDateUTC - Activation date in UTC (may have any time)
 * @returns Activation date normalized to midnight AEST in UTC
 */
export function normalizeActivationDateToMidnight(activationDateUTC: Date): Date {
  // Get the date components in AEST timezone
  const year = parseInt(formatInTimeZone(activationDateUTC, AEST_TIMEZONE, "yyyy"), 10);
  const month = parseInt(formatInTimeZone(activationDateUTC, AEST_TIMEZONE, "M"), 10);
  const day = parseInt(formatInTimeZone(activationDateUTC, AEST_TIMEZONE, "d"), 10);

  // Create date at midnight AEST
  return createAESTDateAsUTC(year, month, day, 0, 0);
}

/**
 * Calculate next draw date (30 days after start date, at 8:30 PM AEST)
 * Used for 30-day rolling cycle
 *
 * @param startDateUTC - Start date of current draw in UTC
 * @returns Next draw date in UTC (30 days later at 8:30 PM AEST)
 */
export function calculateNextDrawDate(startDateUTC: Date): Date {
  // Add 30 days to the UTC date, then get the AEST components of the result
  const nextDrawDateUTC = addDays(startDateUTC, 30);
  const nextYear = parseInt(formatInTimeZone(nextDrawDateUTC, AEST_TIMEZONE, "yyyy"), 10);
  const nextMonth = parseInt(formatInTimeZone(nextDrawDateUTC, AEST_TIMEZONE, "M"), 10);
  const nextDay = parseInt(formatInTimeZone(nextDrawDateUTC, AEST_TIMEZONE, "d"), 10);

  // Create date string in AEST timezone format and convert to UTC
  return createAESTDateAsUTC(nextYear, nextMonth, nextDay, 20, 30); // 8:30 PM
}

/**
 * Calculate when to create next queued draw (7 days before current draw date)
 * @param currentDrawDateUTC - Current draw date in UTC
 * @returns Date when next draw should be created (7 days before, at midnight AEST)
 */
export function calculateNextDrawCreationDate(currentDrawDateUTC: Date): Date {
  // Subtract 7 days from the UTC date, then get the AEST components of the result
  const creationDateUTC = addDays(currentDrawDateUTC, -7);
  const creationYear = parseInt(formatInTimeZone(creationDateUTC, AEST_TIMEZONE, "yyyy"), 10);
  const creationMonth = parseInt(formatInTimeZone(creationDateUTC, AEST_TIMEZONE, "M"), 10);
  const creationDay = parseInt(formatInTimeZone(creationDateUTC, AEST_TIMEZONE, "d"), 10);

  // Create date string in AEST timezone format and convert to UTC
  return createAESTDateAsUTC(creationYear, creationMonth, creationDay, 0, 0); // midnight
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
