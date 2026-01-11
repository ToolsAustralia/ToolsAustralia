/**
 * Default Text Manager Utility
 * 
 * Manages alternating default texts when no scheduled text is active.
 * Alternates once per day (AEST) between "BIGGEST BONUS" and "FIRST 500 PEOPLE".
 * Uses date-based deterministic seed to ensure consistency across all users.
 * All users will see the same text on the same day (AEST).
 */

import { getNowInAEST } from "@/utils/common/timezone";

const DEFAULT_TEXTS = [ "FIRST 500 PEOPLE", "BIGGEST BONUS"];

/**
 * Get the alternating default text for the current day (AEST)
 * Uses date as deterministic seed - all users see the same text on the same day
 * Alternates between "BIGGEST BONUS" and "FIRST 500 PEOPLE" once per day
 * 
 * Algorithm: Uses the full date (YYYY-MM-DD) as a hash seed
 * - Creates a deterministic hash from the date string
 * - Ensures proper alternation even across month boundaries
 * - Example: Jan 31 → Feb 1 will show different texts
 * 
 * This ensures:
 * 1. Consistency across all users on the same day
 * 2. Alternation that changes daily (even across month/year boundaries)
 * 3. Works on both client and server-side
 * 
 * @returns The default text to display for today
 */
export function getAlternatingDefaultText(): string {
  try {
    const nowAEST = getNowInAEST();
    
    // Create date string (YYYY-MM-DD) for deterministic seed
    const year = nowAEST.getFullYear();
    const month = String(nowAEST.getMonth() + 1).padStart(2, "0");
    const day = String(nowAEST.getDate()).padStart(2, "0");
    const dateStr = `${year}-${month}-${day}`;
    
    // Create a simple hash from the date string
    // This ensures proper alternation even across month boundaries
    // (e.g., Jan 31 → Feb 1 will produce different hashes)
    let hash = 0;
    for (let i = 0; i < dateStr.length; i++) {
      const char = dateStr.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Use hash to determine index (0 or 1)
    const index = Math.abs(hash) % 2;
    
    return DEFAULT_TEXTS[index];
  } catch (error) {
    // If any error, default to first text
    return DEFAULT_TEXTS[0];
  }
}

/**
 * Reset function kept for backward compatibility (no-op now)
 * @deprecated No longer needed since we use date-based seed instead of localStorage
 */
export function resetDefaultTextAlternation(): void {
  // No-op: localStorage no longer used
  // Kept for backward compatibility in case it's called elsewhere
}

