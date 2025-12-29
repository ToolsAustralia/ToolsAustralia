/**
 * Klaviyo Draw-Specific Property Calculator
 *
 * Calculates draw-specific properties for Klaviyo profiles based on purchase dates
 * relative to major draw periods. Handles gap periods and freeze dates correctly.
 *
 * @module utils/integrations/klaviyo/klaviyo-draw-calculator
 */

import type { IUser } from "@/models/User";
import type { IMajorDraw } from "@/models/MajorDraw";
import { getTargetMajorDraw } from "@/utils/draws/major-draw-helpers";
import MajorDraw from "@/models/MajorDraw";

/**
 * Result of draw-specific property calculation
 */
export interface DrawSpecificProperties {
  current_draw_id: string;
  current_draw_name: string;
  current_draw_start_date: string;
  current_draw_subscription_active: boolean;
  current_draw_one_time_packages: number;
}

/**
 * Get target draw and cutoff date for calculation
 *
 * Uses same logic as entry allocation (getTargetMajorDraw) for consistency.
 * Cutoff date is the previous draw's freezeEntriesAt, ensuring gap period
 * purchases count for the next draw.
 *
 * Logic:
 * - For Draw 2 (active): Cutoff = Draw 1's freezeEntriesAt
 * - For Draw 2 (queued/gap period): Cutoff = Draw 1's freezeEntriesAt
 * - This ensures purchases after Draw 1's freeze count for Draw 2
 *
 * @returns Object with target draw and cutoff date, or null if no draw found
 */
export async function getTargetDrawForCalculation(): Promise<{
  targetDraw: IMajorDraw;
  cutoffDate: Date;
} | null> {
  try {
    // Get target draw using same logic as entry allocation
    const targetDraw = await getTargetMajorDraw();

    if (!targetDraw) {
      return null;
    }

    // Find previous draw by date (not status) - works for all test scenarios
    // This finds the draw that ended before the target draw activated
    // Works whether previous draw is "active", "frozen", "completed", or "queued"
    const previousDraw = await MajorDraw.findOne({
      drawDate: { $lt: targetDraw.activationDate }, // Previous draw ended before target activated
    })
      .sort({ drawDate: -1 }) // Get the most recent one
      .select("freezeEntriesAt activationDate drawDate status name");

    let cutoffDate: Date;

    if (previousDraw?.freezeEntriesAt) {
      // Use previous draw's freezeEntriesAt as cutoff
      // This ensures purchases after freeze count for current draw
      cutoffDate = previousDraw.freezeEntriesAt;
      
      // Debug logging (only in development)
      if (process.env.NODE_ENV === "development") {
        console.log(`📅 Cutoff date: Using ${previousDraw.name}'s freezeEntriesAt (${cutoffDate.toISOString()})`);
        console.log(`   Previous draw status: ${previousDraw.status}, drawDate: ${previousDraw.drawDate?.toISOString()}`);
      }
    } else {
      // Fallback: if no previous draw found, use target draw's activationDate
      // This handles edge case of first draw or missing data
      cutoffDate = targetDraw.activationDate;
      
      if (process.env.NODE_ENV === "development") {
        console.warn(`⚠️ No previous draw found - using target draw's activationDate as cutoff (${cutoffDate.toISOString()})`);
      }
    }

    return {
      targetDraw,
      cutoffDate,
    };
  } catch (error) {
    console.error("Error getting target draw for calculation:", error);
    return null;
  }
}

/**
 * Calculate draw-specific properties for a user
 *
 * Filters purchases based on cutoff date (previous draw's freezeEntriesAt).
 * This ensures gap period purchases count for the next draw, matching
 * entry allocation behavior.
 *
 * @param user - User model instance
 * @param targetDraw - Target major draw (active or queued)
 * @param cutoffDate - Cutoff date for filtering purchases (previous draw's freezeEntriesAt)
 * @returns Draw-specific property values
 */
export function calculateDrawSpecificProperties(
  user: IUser,
  targetDraw: IMajorDraw,
  cutoffDate: Date
): DrawSpecificProperties {
  // Safe defaults
  const defaults: DrawSpecificProperties = {
    current_draw_id: String(targetDraw._id),
    current_draw_name: targetDraw.name || "Unknown",
    current_draw_start_date: targetDraw.activationDate.toISOString(),
    current_draw_subscription_active: false,
    current_draw_one_time_packages: 0,
  };

  try {
    // Check if subscription started after cutoff date
    if (user.subscription?.isActive && user.subscription?.startDate) {
      const subscriptionStartDate = new Date(user.subscription.startDate);
      
      // ✅ ENHANCED DEBUG: Log comparison details for troubleshooting
      const isAfterCutoff = subscriptionStartDate >= cutoffDate;
      
      if (process.env.NODE_ENV === "development" && process.env.KLAVIYO_DEBUG_DRAW_CALC === "true") {
        console.log(`🔍 [DEBUG] Subscription check for user ${user.email}:`);
        console.log(`   Subscription startDate: ${subscriptionStartDate.toISOString()}`);
        console.log(`   Cutoff date: ${cutoffDate.toISOString()}`);
        console.log(`   Is after cutoff: ${isAfterCutoff ? "✅ YES" : "❌ NO"}`);
        console.log(`   Time difference: ${subscriptionStartDate.getTime() - cutoffDate.getTime()}ms`);
        console.log(`   Subscription isActive: ${user.subscription.isActive}`);
        console.log(`   Current draw: ${targetDraw.name} (activated: ${targetDraw.activationDate.toISOString()})`);
      }
      
      if (isAfterCutoff) {
        defaults.current_draw_subscription_active = true;
      } else {
        // ✅ ADDITIONAL DEBUG: Log why subscription is not active for current draw
        if (process.env.NODE_ENV === "development") {
          console.warn(`⚠️ Subscription for ${user.email} not counted for current draw:`);
          console.warn(`   Start date (${subscriptionStartDate.toISOString()}) is BEFORE cutoff (${cutoffDate.toISOString()})`);
          console.warn(`   This means the subscription started in a previous draw period.`);
        }
      }
    } else {
      // ✅ DEBUG: Log why subscription check was skipped
      if (process.env.NODE_ENV === "development" && process.env.KLAVIYO_DEBUG_DRAW_CALC === "true") {
        console.log(`🔍 [DEBUG] Subscription check skipped for user ${user.email}:`);
        console.log(`   Has subscription: ${!!user.subscription}`);
        console.log(`   isActive: ${user.subscription?.isActive}`);
        console.log(`   has startDate: ${!!user.subscription?.startDate}`);
        if (user.subscription?.startDate) {
          console.log(`   startDate value: ${new Date(user.subscription.startDate).toISOString()}`);
        }
      }
    }

    // Count one-time packages purchased after cutoff date
    if (user.oneTimePackages && user.oneTimePackages.length > 0) {
      const packagesInCurrentDraw = user.oneTimePackages.filter((pkg) => {
        const purchaseDate = new Date(pkg.purchaseDate);
        return purchaseDate >= cutoffDate;
      });
      defaults.current_draw_one_time_packages = packagesInCurrentDraw.length;
    }

    return defaults;
  } catch (error) {
    console.error(`Error calculating draw-specific properties for user ${user._id}:`, error);
    return defaults;
  }
}

/**
 * Calculate draw-specific properties for a user (with automatic draw lookup)
 *
 * Convenience function that automatically gets the target draw and cutoff date,
 * then calculates properties.
 *
 * @param user - User model instance
 * @returns Draw-specific property values, or null if no draw found
 */
export async function calculateDrawSpecificPropertiesForUser(
  user: IUser
): Promise<DrawSpecificProperties | null> {
  const drawInfo = await getTargetDrawForCalculation();

  if (!drawInfo) {
    return null;
  }

  return calculateDrawSpecificProperties(user, drawInfo.targetDraw, drawInfo.cutoffDate);
}

