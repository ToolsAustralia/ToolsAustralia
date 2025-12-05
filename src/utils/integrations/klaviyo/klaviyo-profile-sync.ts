/**
 * Klaviyo Profile Sync Utilities
 *
 * Ensures all users have their profiles synced to Klaviyo,
 * regardless of payment status or interaction history.
 *
 * @module utils/klaviyoProfileSync
 */

import { klaviyo } from "@/lib/klaviyo";
import { userToKlaviyoProfile } from "@/utils/integrations/klaviyo/klaviyo-helpers";
import type { IUser } from "@/models/User";

/**
 * Sync a single user's profile to Klaviyo
 * Non-blocking operation with error handling
 *
 * @param user - User model instance
 * @param brandInterestFromSignup - Optional brand interest from signup (e.g., "milwaukee", "dewalt", "makita")
 *                                   Only used if user hasn't made any purchases yet
 */
export async function syncUserProfileToKlaviyo(user: IUser, brandInterestFromSignup?: string | null): Promise<void> {
  try {
    // console.log(`📊 Syncing Klaviyo profile for user: ${user.email}`);

    // ✅ VALIDATION: Log user data structure before processing
    // console.log(`📊 User data validation before sync:`, {
    //   userId: user._id?.toString(),
    //   email: user.email,
    //   hasUpsellPurchases: !!user.upsellPurchases,
    //   upsellPurchasesLength: user.upsellPurchases?.length || 0,
    //   hasSubscription: !!user.subscription,
    //   subscriptionIsActive: user.subscription?.isActive,
    //   accumulatedEntries: user.accumulatedEntries,
    //   rewardsPoints: user.rewardsPoints,
    // });

    // ✅ CRITICAL FIX: await the async userToKlaviyoProfile function
    const profile = await userToKlaviyoProfile(user, brandInterestFromSignup);
    const result = await klaviyo.upsertProfile(profile);

    if (result.success) {
      // console.log(`✅ Klaviyo profile synced successfully for: ${user.email}`);
    } else {
      // console.error(`❌ Failed to sync Klaviyo profile for ${user.email}:`, result.error);
    }
  } catch (error) {
    console.error(`❌ Error syncing Klaviyo profile for ${user.email}:`, error);
  }
}

/**
 * Sync user profile to Klaviyo (non-blocking)
 * Use this for background operations where you don't want to wait
 *
 * @param user - User model instance
 * @param brandInterestFromSignup - Optional brand interest from signup
 */
export function syncUserProfileToKlaviyoBackground(user: IUser, brandInterestFromSignup?: string | null): void {
  syncUserProfileToKlaviyo(user, brandInterestFromSignup).catch((error) => {
    console.error(`❌ Background Klaviyo profile sync failed for ${user.email}:`, error);
  });
}

/**
 * Sync multiple users' profiles to Klaviyo
 * Useful for bulk operations or data migration
 */
export async function syncMultipleUserProfilesToKlaviyo(users: IUser[]): Promise<void> {
  // console.log(`📊 Starting bulk Klaviyo profile sync for ${users.length} users`);

  const syncPromises = users.map((user) => syncUserProfileToKlaviyo(user));

  try {
    await Promise.allSettled(syncPromises);
    // console.log(`✅ Bulk Klaviyo profile sync completed for ${users.length} users`);
  } catch (error) {
    console.error(`❌ Bulk Klaviyo profile sync failed:`, error);
  }
}

/**
 * Ensure user profile is synced after any user data change
 * This is a convenience function that can be called after user updates
 *
 * @param user - User model instance
 * @param brandInterestFromSignup - Optional brand interest from signup (only used during registration)
 */
export function ensureUserProfileSynced(user: IUser, brandInterestFromSignup?: string | null): void {
  // Only sync if Klaviyo is enabled
  if (process.env.KLAVIYO_ENABLED !== "false") {
    // console.log(`📊 ensureUserProfileSynced called for user: ${user.email}`);
    // console.log(`📊 User data - accumulatedEntries: ${user.accumulatedEntries}, rewardsPoints: ${user.rewardsPoints}`);
    syncUserProfileToKlaviyoBackground(user, brandInterestFromSignup);
  } else {
    // console.log(`📊 Klaviyo is disabled, skipping profile sync for: ${user.email}`);
  }
}
