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
 * Subscribe user to Klaviyo lists ONCE during registration
 * ⚠️ CRITICAL: This should ONLY be called during user registration, never during profile syncs
 * This ensures users who manually unsubscribe via Klaviyo links won't be resubscribed
 *
 * Subscribes to:
 * - Email marketing (always)
 * - SMS marketing (if phone number exists)
 * - SMS transactional (if phone number exists) - subscribed immediately, no purchase required
 *
 * @param user - User model instance
 * @param profileId - Klaviyo profile ID (from upsertProfile)
 */
export async function subscribeUserToKlaviyoOnRegistration(user: IUser, profileId: string): Promise<void> {
  try {
    const profile = await userToKlaviyoProfile(user);

    // ✅ Subscribe to email marketing (always)
    if (user.email) {
      try {
        const emailResult = await klaviyo.subscribeToEmailList(profileId, user.email);
        if (emailResult.success) {
          console.log(`✅ User subscribed to email on registration: ${user.email}`);
        } else {
          console.warn(`⚠️ Failed to subscribe user to email on registration: ${emailResult.error}`);
        }
      } catch (emailError) {
        console.error(`❌ Error subscribing user to email on registration: ${emailError}`);
      }
    }

    // ✅ Subscribe to SMS marketing AND transactional (if phone number exists)
    // Both are subscribed immediately - no need to wait for purchase
    if (profile.phone_number) {
      try {
        // Subscribe to both marketing and transactional immediately
        const consentTypes: ("sms_marketing" | "sms_transactional")[] = [
          "sms_marketing",
          "sms_transactional", // ✅ Always include transactional from registration
        ];

        const smsResult = await klaviyo.subscribeToSMSList(profileId, profile.phone_number, consentTypes);
        if (smsResult.success) {
          console.log(`✅ User subscribed to SMS (marketing + transactional) on registration: ${user.email}`);
        } else {
          console.warn(`⚠️ Failed to subscribe user to SMS on registration: ${smsResult.error}`);
        }
      } catch (smsError) {
        console.error(`❌ Error subscribing user to SMS on registration: ${smsError}`);
      }
    }
  } catch (error) {
    console.error(`❌ Error in initial Klaviyo subscription for ${user.email}:`, error);
  }
}

/**
 * Sync a single user's profile to Klaviyo
 * ⚠️ IMPORTANT: This function ONLY updates profile data, NOT subscription status
 * Subscriptions are handled separately during registration to respect user unsubscribe preferences
 *
 * This ensures that if a user manually unsubscribes via Klaviyo's unsubscribe link,
 * their profile data can still be updated without resubscribing them.
 *
 * @param user - User model instance
 * @param brandInterestFromSignup - Optional brand interest from signup (e.g., "milwaukee", "dewalt", "makita")
 *                                   Only used if user hasn't made any purchases yet
 */
export async function syncUserProfileToKlaviyo(user: IUser, brandInterestFromSignup?: string | null): Promise<void> {
  try {
    // ✅ CRITICAL FIX: await the async userToKlaviyoProfile function
    const profile = await userToKlaviyoProfile(user, brandInterestFromSignup);
    const result = await klaviyo.upsertProfile(profile);

    if (result.success && result.profile_id) {
      // ✅ Profile data synced successfully
      // ⚠️ NOTE: We do NOT subscribe here to respect user's unsubscribe preferences
      // Subscriptions are only set during initial registration via subscribeUserToKlaviyoOnRegistration
      // console.log(`✅ Klaviyo profile synced (data only, no subscription changes): ${user.email}`);
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
