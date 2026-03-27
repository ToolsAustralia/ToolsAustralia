"use client";

import { useEffect } from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { formatInTimeZone } from "date-fns-tz";

const AEST_TIMEZONE = "Australia/Sydney";
const DARK_MODE_START_HOUR = 18; // 6 PM
const LIGHT_MODE_START_HOUR = 6; // 6 AM

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
        const now = new Date();
        
        // Get current hour in Australia/Sydney timezone (handles AEST/AEDT automatically)
        const hourStr = formatInTimeZone(now, AEST_TIMEZONE, "H");
        const currentHour = parseInt(hourStr, 10);

        // Determine if we should be in dark mode
        // Dark mode: 18:00 (6 PM) to 05:59 (5:59 AM)
        const shouldBeDark = currentHour >= DARK_MODE_START_HOUR || currentHour < LIGHT_MODE_START_HOUR;
        const targetTheme = shouldBeDark ? "dark" : "light";

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
  const hourStr = formatInTimeZone(now, AEST_TIMEZONE, "H");
  const currentHour = parseInt(hourStr, 10);

  if (currentHour >= DARK_MODE_START_HOUR || currentHour < LIGHT_MODE_START_HOUR) {
    // Currently dark mode, next transition is to light at 6 AM
    return { time: "6:00 AM", theme: "light" };
  } else {
    // Currently light mode, next transition is to dark at 6 PM
    return { time: "6:00 PM", theme: "dark" };
  }
}
