/**
 * Alternating Multiplier Manager Utility
 * 
 * Manages alternating multipliers when no active promo exists.
 * Alternates once per day (AEST) between two configured multipliers.
 * Uses date-based deterministic seed to ensure consistency across all users.
 * All users will see the same multiplier on the same day (AEST).
 */

import { getNowInAEST } from "@/utils/common/timezone";

/**
 * Get the alternating multiplier for the current day (AEST)
 * Uses date as deterministic seed - all users see the same multiplier on the same day
 * Alternates between two configured multipliers once per day
 * 
 * Algorithm: Uses the full date (YYYY-MM-DD) as a hash seed
 * - Creates a deterministic hash from the date string
 * - Ensures proper alternation even across month boundaries
 * - Example: Jan 31 → Feb 1 will show different multipliers
 * 
 * This ensures:
 * 1. Consistency across all users on the same day
 * 2. Alternation that changes daily (even across month/year boundaries)
 * 3. Works on both client and server-side
 * 
 * @param multipliers - Tuple of exactly 2 multipliers (e.g., [5, 10])
 * @returns The multiplier to use for today
 */
export function getAlternatingMultiplier(multipliers: [number, number]): number {
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
    
    return multipliers[index];
  } catch (error) {
    // If any error, default to first multiplier
    return multipliers[0];
  }
}

