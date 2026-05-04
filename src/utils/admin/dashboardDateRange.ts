import { subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import {
  createAESTDateAsUTC,
  getStartOfTodayInAEST,
  getWebsiteLaunchDateUTC,
} from "@/utils/common/timezone";

export type AdminDashboardDateRangeKey =
  | "today"
  | "yesterday"
  | "all-time"
  | "custom"
  | "current-draw"
  | "last-draw";

export type MembershipAsOfMode = "live" | "snapshot";

export interface ParsedAdminDashboardDateRange {
  startDate: Date;
  endDate: Date;
  dateRange: AdminDashboardDateRangeKey;
  /** "live" → read current User.subscription; "snapshot" → read MembershipDailySnapshot for asOfDate. */
  membershipAsOfMode: MembershipAsOfMode;
  /** End-of-day (Sydney) for snapshot reads; null when mode is "live". */
  asOfDate: Date | null;
}

export type ParseAdminDashboardDateRangeResult =
  | { ok: true; value: ParsedAdminDashboardDateRange }
  | { ok: false; error: string; status: number };

const AEST_TIMEZONE = "Australia/Sydney";

/**
 * Shared AEST-normalized dashboard range (matches admin dashboard stats route).
 */
export function parseAdminDashboardDateRange(input: {
  dateRange: string | null | undefined;
  startDateParam?: string | null;
  endDateParam?: string | null;
}): ParseAdminDashboardDateRangeResult {
  const dateRange = (input.dateRange as AdminDashboardDateRangeKey) || "today";
  const startDateParam = input.startDateParam ?? null;
  const endDateParam = input.endDateParam ?? null;

  let startDate: Date;
  let endDate: Date;

  const startOfToday = getStartOfTodayInAEST();
  const now = new Date();
  const todayYear = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "yyyy"), 10);
  const todayMonth = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "M"), 10);
  const todayDay = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "d"), 10);
  const endOfToday = createAESTDateAsUTC(todayYear, todayMonth, todayDay, 23, 59);
  endOfToday.setUTCSeconds(59, 999);
  endDate = endOfToday;

  switch (dateRange) {
    case "today":
      startDate = startOfToday;
      endDate = endOfToday;
      break;
    case "yesterday": {
      const yesterdayStart = subDays(startOfToday, 1);
      startDate = yesterdayStart;
      endDate = new Date(startOfToday.getTime() - 1);
      break;
    }
    case "current-draw":
    case "last-draw": {
      if (!startDateParam || !endDateParam) {
        return {
          ok: false,
          error: "startDate and endDate are required for draw-based ranges",
          status: 400,
        };
      }
      const drawStartDateParsed = new Date(startDateParam);
      const drawEndDateParsed = new Date(endDateParam);
      const drawStartYear = parseInt(formatInTimeZone(drawStartDateParsed, AEST_TIMEZONE, "yyyy"), 10);
      const drawStartMonth = parseInt(formatInTimeZone(drawStartDateParsed, AEST_TIMEZONE, "M"), 10);
      const drawStartDay = parseInt(formatInTimeZone(drawStartDateParsed, AEST_TIMEZONE, "d"), 10);
      const drawEndYear = parseInt(formatInTimeZone(drawEndDateParsed, AEST_TIMEZONE, "yyyy"), 10);
      const drawEndMonth = parseInt(formatInTimeZone(drawEndDateParsed, AEST_TIMEZONE, "M"), 10);
      const drawEndDay = parseInt(formatInTimeZone(drawEndDateParsed, AEST_TIMEZONE, "d"), 10);
      startDate = createAESTDateAsUTC(drawStartYear, drawStartMonth, drawStartDay, 0, 0);
      const drawNextDayStart = createAESTDateAsUTC(drawEndYear, drawEndMonth, drawEndDay, 0, 0);
      const drawNextDay = new Date(drawNextDayStart);
      drawNextDay.setUTCDate(drawNextDay.getUTCDate() + 1);
      endDate = new Date(drawNextDay.getTime() - 1);
      break;
    }
    case "all-time":
      startDate = getWebsiteLaunchDateUTC();
      endDate = endOfToday;
      break;
    case "custom": {
      if (!startDateParam || !endDateParam) {
        return { ok: false, error: "startDate and endDate are required for custom range", status: 400 };
      }
      const startDateParsed = new Date(startDateParam);
      const endDateParsed = new Date(endDateParam);
      const startYear = parseInt(formatInTimeZone(startDateParsed, AEST_TIMEZONE, "yyyy"), 10);
      const startMonth = parseInt(formatInTimeZone(startDateParsed, AEST_TIMEZONE, "M"), 10);
      const startDay = parseInt(formatInTimeZone(startDateParsed, AEST_TIMEZONE, "d"), 10);
      const endYear = parseInt(formatInTimeZone(endDateParsed, AEST_TIMEZONE, "yyyy"), 10);
      const endMonth = parseInt(formatInTimeZone(endDateParsed, AEST_TIMEZONE, "M"), 10);
      const endDay = parseInt(formatInTimeZone(endDateParsed, AEST_TIMEZONE, "d"), 10);
      startDate = createAESTDateAsUTC(startYear, startMonth, startDay, 0, 0);
      const nextDayStart = createAESTDateAsUTC(endYear, endMonth, endDay, 0, 0);
      const nextDay = new Date(nextDayStart);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      endDate = new Date(nextDay.getTime() - 1);
      break;
    }
    default:
      startDate = startOfToday;
      endDate = endOfToday;
  }

  const todayEndMs = endOfToday.getTime();
  const asOfDateMs = Math.min(endDate.getTime(), todayEndMs);
  const asOfDate = new Date(asOfDateMs);
  const isFuture = endDate.getTime() > todayEndMs;
  const isToday = dateRange === "today" || asOfDateMs === todayEndMs;

  const membershipAsOfMode: MembershipAsOfMode =
    isToday || isFuture || dateRange === "all-time" ? "live" : "snapshot";

  return {
    ok: true,
    value: {
      startDate,
      endDate,
      dateRange,
      membershipAsOfMode,
      asOfDate: membershipAsOfMode === "snapshot" ? asOfDate : null,
    },
  };
}
