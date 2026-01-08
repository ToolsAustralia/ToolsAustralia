/**
 * Default Text Manager Utility
 * 
 * Manages alternating default texts when no scheduled text is active.
 * Alternates once per day (AEST) between "BIGGEST BONUS" and "FIRST 500 PEOPLE".
 * Uses localStorage to track which default text was shown for the current day.
 */

import { getNowInAEST } from "@/utils/common/timezone";

const STORAGE_KEY_DATE = "promoBannerDefaultDate";
const STORAGE_KEY_INDEX = "promoBannerDefaultIndex";
const DEFAULT_TEXTS = ["BIGGEST BONUS", "FIRST 500 PEOPLE"];

/**
 * Get the current date string in AEST (YYYY-MM-DD format)
 * @returns Date string in format YYYY-MM-DD
 */
function getCurrentDateStringAEST(): string {
  const nowAEST = getNowInAEST();
  const year = nowAEST.getFullYear();
  const month = String(nowAEST.getMonth() + 1).padStart(2, "0");
  const day = String(nowAEST.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get the alternating default text for the current day (AEST)
 * Alternates between "BIGGEST BONUS" and "FIRST 500 PEOPLE" once per day
 * @returns The default text to display for today
 */
export function getAlternatingDefaultText(): string {
  try {
    if (typeof window === "undefined") {
      // Server-side rendering: default to first text
      return DEFAULT_TEXTS[0];
    }

    const currentDateStr = getCurrentDateStringAEST();
    const storedDateStr = localStorage.getItem(STORAGE_KEY_DATE);
    const storedIndex = localStorage.getItem(STORAGE_KEY_INDEX);

    // If it's a new day, start with BIGGEST BONUS (index 0) and alternate from there
    if (storedDateStr !== currentDateStr) {
      // Get the last index to determine what to show today
      const lastIndex = storedIndex ? parseInt(storedIndex, 10) : -1;
      // If lastIndex was -1 (no previous day) or 1 (was "FIRST 500 PEOPLE"), start with "BIGGEST BONUS" (0)
      // If lastIndex was 0 (was "BIGGEST BONUS"), show "FIRST 500 PEOPLE" (1)
      const nextIndex = lastIndex === 0 ? 1 : 0;
      
      // Store new date and index
      localStorage.setItem(STORAGE_KEY_DATE, currentDateStr);
      localStorage.setItem(STORAGE_KEY_INDEX, nextIndex.toString());
      
      return DEFAULT_TEXTS[nextIndex];
    }

    // Same day: return the text that was already shown today
    const currentIndex = storedIndex ? parseInt(storedIndex, 10) : 0;
    return DEFAULT_TEXTS[currentIndex] || DEFAULT_TEXTS[0];
  } catch (error) {
    // If localStorage is not available, default to first text
    return DEFAULT_TEXTS[0];
  }
}

/**
 * Reset the default text alternation (useful for testing)
 */
export function resetDefaultTextAlternation(): void {
  try {
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY_DATE);
      localStorage.removeItem(STORAGE_KEY_INDEX);
    }
  } catch (error) {
    // Ignore errors
  }
}

