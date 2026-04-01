import { formatInTimeZone } from "date-fns-tz";

export const SYDNEY_TZ = "Australia/Sydney";
export const DARK_MODE_START_HOUR = 18;
export const LIGHT_MODE_START_HOUR = 6;

/**
 * Theme from wall-clock in Sydney (AEST/AEDT): dark 18:00–05:59, light 06:00–17:59.
 */
export function getScheduledThemeForSydney(now: Date = new Date()): "light" | "dark" {
  const hourStr = formatInTimeZone(now, SYDNEY_TZ, "H");
  const currentHour = parseInt(hourStr, 10);
  const shouldBeDark = currentHour >= DARK_MODE_START_HOUR || currentHour < LIGHT_MODE_START_HOUR;
  return shouldBeDark ? "dark" : "light";
}
