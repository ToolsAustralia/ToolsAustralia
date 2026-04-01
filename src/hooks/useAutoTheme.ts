"use client";

import { useEffect } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import {
  DARK_MODE_START_HOUR,
  getScheduledThemeForSydney,
  LIGHT_MODE_START_HOUR,
  SYDNEY_TZ,
} from "@/utils/themeSchedule";
import { formatInTimeZone } from "date-fns-tz";

/**
 * Auto Theme Hook
 * 
 * Automatically switches theme based on time of day in Australian timezone:
 * - 6:00 PM AEST/AEDT → Dark mode
 * - 6:00 AM AEST/AEDT → Light mode
 * 
 * Respects user manual override - if user manually toggles theme,
 * auto-switching is disabled until they re-enable it.
 * 
 * Uses existing timezone utilities from src/utils/common/timezone.ts
 */
export function useAutoTheme() {
  const { theme, setTheme, autoThemeEnabled, userManualOverride } = useThemeStore();

  useEffect(() => {
    // Don't run auto-theme if disabled or user manually overrode
    if (!autoThemeEnabled || userManualOverride) {
      return;
    }

    /**
     * Check current time in AEST/AEDT and set appropriate theme
     */
    const checkAndSetTheme = () => {
      try {
        const targetTheme = getScheduledThemeForSydney();

        // Only update if theme needs to change
        if (theme !== targetTheme) {
          setTheme(targetTheme);
        }
      } catch (error) {
        console.error("Error in auto-theme check:", error);
      }
    };

    // Check immediately on mount
    checkAndSetTheme();

    // Check every minute for theme changes
    const intervalId = setInterval(checkAndSetTheme, 60 * 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [theme, setTheme, autoThemeEnabled, userManualOverride]);
}

/**
 * Get the next theme transition time in AEST
 * Useful for displaying "Auto dark mode at 6:00 PM" messages
 */
export function getNextThemeTransitionTime(): { time: string; theme: "dark" | "light" } {
  const now = new Date();
  const hourStr = formatInTimeZone(now, SYDNEY_TZ, "H");
  const currentHour = parseInt(hourStr, 10);

  if (currentHour >= DARK_MODE_START_HOUR || currentHour < LIGHT_MODE_START_HOUR) {
    // Currently dark mode, next transition is to light at 6 AM
    return { time: "6:00 AM", theme: "light" };
  } else {
    // Currently light mode, next transition is to dark at 6 PM
    return { time: "6:00 PM", theme: "dark" };
  }
}
