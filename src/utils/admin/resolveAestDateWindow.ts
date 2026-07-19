import { formatInTimeZone } from "date-fns-tz";
import { subDays } from "date-fns";
import { getWebsiteLaunchDateUTC } from "@/utils/common/timezone";

const AEST_TIMEZONE = "Australia/Sydney";

/**
 * Resolve the admin Overview date filter to concrete AEST yyyy-MM-dd bounds —
 * the same calendar-day semantics as Facebook Ads → Spend by URL. Custom dates
 * win; draw presets arrive as custom dates from DashboardOverview; presets that
 * can't resolve return { undefined, undefined } so callers can gate fetches.
 */
export function resolveAestDateWindow(
  dateRange: string,
  customStartDate?: string,
  customEndDate?: string,
): { startDate?: string; endDate?: string } {
  const todayAest = () => formatInTimeZone(new Date(), AEST_TIMEZONE, "yyyy-MM-dd");
  const yesterdayAest = () => formatInTimeZone(subDays(new Date(), 1), AEST_TIMEZONE, "yyyy-MM-dd");

  const startDate = (() => {
    if (customStartDate && customEndDate) return customStartDate;
    if (dateRange === "custom" && customStartDate) return customStartDate;
    if (dateRange === "today") return todayAest();
    if (dateRange === "yesterday") return yesterdayAest();
    if (dateRange === "all-time") return formatInTimeZone(getWebsiteLaunchDateUTC(), AEST_TIMEZONE, "yyyy-MM-dd");
    return undefined;
  })();

  const endDate = (() => {
    if (customStartDate && customEndDate) return customEndDate;
    if (dateRange === "custom" && customEndDate) return customEndDate;
    if (dateRange === "today") return todayAest();
    if (dateRange === "yesterday") return yesterdayAest();
    if (dateRange === "all-time") return todayAest();
    return undefined;
  })();

  return { startDate, endDate };
}
