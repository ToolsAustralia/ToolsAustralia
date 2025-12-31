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
import PaymentEvent from "@/models/PaymentEvent";

/**
 * Result of draw-specific property calculation
 */
export interface DrawSpecificProperties {
  current_draw_id: string;
  current_draw_name: string;
  current_draw_start_date: string;
  current_draw_subscription_active: boolean;
  current_draw_one_time_packages: number;
  current_draw_entries: number;
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
export async function calculateDrawSpecificProperties(
  user: IUser,
  targetDraw: IMajorDraw,
  cutoffDate: Date
): Promise<DrawSpecificProperties> {
  // Safe defaults
  const defaults: DrawSpecificProperties = {
    current_draw_id: String(targetDraw._id),
    current_draw_name: targetDraw.name || "Unknown",
    current_draw_start_date: targetDraw.activationDate.toISOString(),
    current_draw_subscription_active: false,
    current_draw_one_time_packages: 0,
    current_draw_entries: 0,
  };

  try {
    // ✅ FIX: Check if subscription is active AND (started OR renewed) during current draw period
    // Property means "Subscribed DURING current draw period" - so subscription must have
    // started OR been renewed AFTER the cutoff date
    // 
    // Logic:
    // 1. If subscription started after cutoff: It's a new subscription during current draw → TRUE
    // 2. If subscription started before cutoff but is still active: Check PaymentEvent to see
    //    if there was a renewal (subscription_cycle) after cutoff → TRUE if renewed, FALSE otherwise
    // 3. If subscription is not active: → FALSE
    if (user.subscription?.isActive && user.subscription.startDate) {
      const subscriptionStartDate = new Date(user.subscription.startDate);
      
      // Case 1: Subscription started after cutoff (new subscription during current draw)
      if (subscriptionStartDate >= cutoffDate) {
        defaults.current_draw_subscription_active = true;
        
        if (process.env.NODE_ENV === "development" && process.env.KLAVIYO_DEBUG_DRAW_CALC === "true") {
          console.log(`🔍 [DEBUG] Subscription active for current draw - user ${user.email}:`);
          console.log(`   Subscription isActive: true`);
          console.log(`   Subscription startDate: ${subscriptionStartDate.toISOString()}`);
          console.log(`   Cutoff date: ${cutoffDate.toISOString()}`);
          console.log(`   Current draw: ${targetDraw.name} (activated: ${targetDraw.activationDate.toISOString()})`);
          console.log(`   ✅ Marked as active (started after cutoff - new subscription)`);
        }
      } else {
        // Case 2: Subscription started before cutoff but is still active
        // Check if there was a renewal (subscription_cycle) OR upgrade (subscription_update) after cutoff date
        // Upgrades reset startDate to new Date(), but if upgrade happened before cutoff, we need to check PaymentEvent
        try {
          const renewalOrUpgradeEvent = await PaymentEvent.findOne({
            userId: user._id,
            packageType: "membership",
            eventType: "BenefitsGranted",
            timestamp: { $gte: cutoffDate },
            $or: [
              { "data.billingReason": "subscription_cycle" }, // Renewal payments
              { "data.billingReason": "subscription_update" }, // Upgrade payments
            ],
          })
            .sort({ timestamp: -1 }) // Get most recent renewal/upgrade
            .lean();

          if (renewalOrUpgradeEvent) {
            // Subscription was renewed or upgraded after cutoff - mark as active for current draw
            const eventType = renewalOrUpgradeEvent.data?.billingReason === "subscription_update" ? "upgraded" : "renewed";
            defaults.current_draw_subscription_active = true;
            
            if (process.env.NODE_ENV === "development" && process.env.KLAVIYO_DEBUG_DRAW_CALC === "true") {
              console.log(`🔍 [DEBUG] Subscription active for current draw (${eventType}) - user ${user.email}:`);
              console.log(`   Subscription isActive: true`);
              console.log(`   Subscription startDate: ${subscriptionStartDate.toISOString()}`);
              console.log(`   Cutoff date: ${cutoffDate.toISOString()}`);
              console.log(`   ${eventType === "upgraded" ? "Upgrade" : "Renewal"} event found: ${renewalOrUpgradeEvent.timestamp.toISOString()}`);
              console.log(`   Current draw: ${targetDraw.name} (activated: ${targetDraw.activationDate.toISOString()})`);
              console.log(`   ✅ Marked as active (${eventType} during current draw period)`);
            }
          } else {
            // Subscription started before cutoff and no renewal/upgrade found after cutoff
            // It's from a previous draw, not renewed/upgraded during current draw → FALSE
            defaults.current_draw_subscription_active = false;
            
            if (process.env.NODE_ENV === "development" && process.env.KLAVIYO_DEBUG_DRAW_CALC === "true") {
              console.log(`🔍 [DEBUG] Subscription NOT active for current draw - user ${user.email}:`);
              console.log(`   Subscription isActive: true`);
              console.log(`   Subscription startDate: ${subscriptionStartDate.toISOString()}`);
              console.log(`   Cutoff date: ${cutoffDate.toISOString()}`);
              console.log(`   No renewal or upgrade found after cutoff date`);
              console.log(`   ❌ NOT marked as active (started before cutoff, not renewed/upgraded during current draw)`);
            }
          }
        } catch (renewalCheckError) {
          // If PaymentEvent query fails, fall back to false (conservative approach)
          console.error(`Error checking renewal/upgrade for user ${user._id}:`, renewalCheckError);
          defaults.current_draw_subscription_active = false;
        }
      }
    } else {
      // Case 3: Subscription is not active or has no startDate
      defaults.current_draw_subscription_active = false;
      
      if (process.env.NODE_ENV === "development" && process.env.KLAVIYO_DEBUG_DRAW_CALC === "true") {
        console.log(`🔍 [DEBUG] Subscription check skipped for user ${user.email}:`);
        console.log(`   Has subscription: ${!!user.subscription}`);
        console.log(`   isActive: ${user.subscription?.isActive}`);
        console.log(`   has startDate: ${!!user.subscription?.startDate}`);
        if (user.subscription?.startDate) {
          console.log(`   startDate value: ${new Date(user.subscription.startDate).toISOString()}`);
        }
        console.log(`   ❌ NOT marked as active (subscription not active or missing startDate)`);
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

    // ✅ Calculate current_draw_entries: Get user's total entries in the target draw
    try {
      const userEntry = targetDraw.entries.find(
        (entry: { userId: { toString(): string } }) => entry.userId.toString() === user._id.toString()
      );
      
      if (userEntry) {
        defaults.current_draw_entries = userEntry.totalEntries || 0;
        
        if (process.env.NODE_ENV === "development" && process.env.KLAVIYO_DEBUG_DRAW_CALC === "true") {
          console.log(`🔍 [DEBUG] Current draw entries for user ${user.email}:`);
          console.log(`   Total entries in draw "${targetDraw.name}": ${defaults.current_draw_entries}`);
        }
      } else {
        // No entry found in draw - user hasn't been allocated entries to this draw yet
        defaults.current_draw_entries = 0;
        
        if (process.env.NODE_ENV === "development" && process.env.KLAVIYO_DEBUG_DRAW_CALC === "true") {
          console.log(`🔍 [DEBUG] No entry found in draw "${targetDraw.name}" for user ${user.email}`);
        }
      }
    } catch (entryError) {
      // Log error but don't fail - use default of 0
      console.error(`Error calculating current_draw_entries for user ${user._id}:`, entryError);
      defaults.current_draw_entries = 0;
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

    return await calculateDrawSpecificProperties(user, drawInfo.targetDraw, drawInfo.cutoffDate);
}

