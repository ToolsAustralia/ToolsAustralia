/**
 * Default Text Manager Utility
 * 
 * Manages alternating default texts when no scheduled text is active.
 * Uses localStorage to track which default text was last used.
 */

const STORAGE_KEY = "promoBannerDefaultIndex";
const DEFAULT_TEXTS = ["BOOST ACTIVATED", "FIRST 500 PEOPLE"];

/**
 * Get the next alternating default text
 * Alternates between "BOOST ACTIVATED" and "FIRST 500 PEOPLE"
 * @returns The default text to display
 */
export function getAlternatingDefaultText(): string {
  try {
    const lastIndex = localStorage.getItem(STORAGE_KEY);
    const currentIndex = lastIndex ? (parseInt(lastIndex, 10) + 1) % DEFAULT_TEXTS.length : 0;
    
    localStorage.setItem(STORAGE_KEY, currentIndex.toString());
    return DEFAULT_TEXTS[currentIndex];
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
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    // Ignore errors
  }
}

