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
import { calculateDrawSpecificPropertiesForUser } from "@/utils/integrations/klaviyo/klaviyo-draw-calculator";
import type { IUser } from "@/models/User";
import type { IMajorDraw } from "@/models/MajorDraw";
import type { UserGrantLedger } from "@/utils/payment/payment-event-net-queries";

/**
 * Subscribe user to Klaviyo lists ONCE during registration
 * ⚠️ CRITICAL: This should ONLY be called during user registration, never during profile syncs
 * This ensures users who manually unsubscribe via Klaviyo links won't be resubscribed
 *
 * Subscribes to:
 * - Email marketing (unless User.acceptsPromotionalEmail === false)
 * - SMS marketing (if phone number exists)
 * - SMS transactional (if phone number exists) - subscribed immediately, no purchase required
 *
 * @param user - User model instance
 * @param profileId - Klaviyo profile ID (from upsertProfile)
 */
export async function subscribeUserToKlaviyoOnRegistration(user: IUser, profileId: string): Promise<void> {
  try {
    const profile = await userToKlaviyoProfile(user);

    // ✅ Subscribe to email marketing when not opted out via app flag
    if (user.email && user.acceptsPromotionalEmail !== false) {
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
    } else if (user.email && user.acceptsPromotionalEmail === false) {
      console.log(
        `ℹ️ Skipping Klaviyo email marketing subscribe on registration (acceptsPromotionalEmail=false): ${user.email}`
      );
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
 * Apply Klaviyo marketing (email + SMS marketing) after an admin changes User.acceptsPromotionalEmail.
 * SMS uses the E.164 number from the same shape as profile sync. Transactional SMS is not changed here.
 * Does not run when KLAVIYO_ENABLED is false.
 */
export async function syncKlaviyoEmailMarketingFromAdminPreference(
  user: IUser,
  wantsPromotionalEmail: boolean
): Promise<{ success: boolean; error?: string }> {
  if (process.env.KLAVIYO_ENABLED === "false") {
    return { success: true };
  }

  if (!user.email?.trim()) {
    return { success: false, error: "User has no email" };
  }

  try {
    const profile = await userToKlaviyoProfile(user);
    const upsert = await klaviyo.upsertProfile(profile);

    if (!upsert.success || !upsert.profile_id) {
      return {
        success: false,
        error: upsert.error || "Klaviyo profile upsert failed",
      };
    }

    const profileId = upsert.profile_id;
    const phoneE164 = profile.phone_number?.trim();
    const errors: string[] = [];

    if (wantsPromotionalEmail) {
      const emailRes = await klaviyo.subscribeToEmailList(profileId, user.email);
      if (!emailRes.success) errors.push(emailRes.error || "Email subscribe failed");

      if (phoneE164) {
        const smsRes = await klaviyo.subscribeToSMSList(profileId, phoneE164, ["sms_marketing"]);
        if (!smsRes.success) errors.push(smsRes.error || "SMS marketing subscribe failed");
      }
    } else {
      const emailRes = await klaviyo.unsubscribeFromEmailList(profileId, user.email);
      if (!emailRes.success) errors.push(emailRes.error || "Email unsubscribe failed");

      // Resolve the phone number: prefer the locally-stored mobile, fall back to the
      // phone Klaviyo holds on the profile. This handles members who provided their
      // phone number during Klaviyo-side subscription flows but never stored it in
      // User.mobile (pre-existing bug: SMS unsubscribe silently no-oped without a
      // local mobile).
      let resolvedPhone = phoneE164;
      if (!resolvedPhone) {
        resolvedPhone = await klaviyo.findProfilePhoneByEmail(user.email) ?? undefined;
      }

      if (resolvedPhone) {
        const smsRes = await klaviyo.unsubscribeFromSMSList(profileId, resolvedPhone);
        if (!smsRes.success) errors.push(smsRes.error || "SMS marketing unsubscribe failed");
      } else {
        // No phone anywhere — genuine no-op for SMS; email unsubscribe already completed above.
        console.error(
          `[klaviyo-profile-sync] No phone number found (local or Klaviyo-held) for ${user.email} — SMS marketing unsubscribe skipped`
        );
      }
    }

    return errors.length ? { success: false, error: errors.join(" ") } : { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
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
 * @param targetDraw - Optional cached target draw (for performance optimization in bulk operations)
 * @param cutoffDate - Optional cached cutoff date (for performance optimization in bulk operations)
 * @param ledger - Optional prefetched paid-grant ledger (batch callers resolve one per batch)
 *
 * @returns **true only when the upsert actually landed in Klaviyo.**
 *
 * This function swallows its own errors by design — a profile sync must never break the caller
 * — so the return value is the ONLY signal that the write succeeded. Any caller that depends on
 * the profile being current (the reconciliation sweep) MUST check it: treating a swallowed
 * failure as success advances the sweep's watermark past users whose write was refused, which
 * silently skips them forever. That is the exact failure class this subsystem exists to remove.
 *
 * Same contract as `DrawGrantService.grantMonthlyCouponEntries`: false means "not delivered".
 */
export async function syncUserProfileToKlaviyo(
  user: IUser,
  brandInterestFromSignup?: string | null,
  targetDraw?: IMajorDraw,
  cutoffDate?: Date,
  ledger?: UserGrantLedger
): Promise<boolean> {
  try {
    // ✅ CRITICAL FIX: await the async userToKlaviyoProfile function
    // Pass cached draw data if provided to avoid redundant database queries
    const profile = await userToKlaviyoProfile(user, brandInterestFromSignup, targetDraw, cutoffDate, ledger);
    const result = await klaviyo.upsertProfile(profile);

    if (result.success && result.profile_id) {
      // ✅ Profile data synced successfully
      // ⚠️ NOTE: We do NOT subscribe here to respect user's unsubscribe preferences
      // Subscriptions are only set during initial registration via subscribeUserToKlaviyoOnRegistration
      // console.log(`✅ Klaviyo profile synced (data only, no subscription changes): ${user.email}`);
      
      // Verify draw-specific properties were included
      if (process.env.NODE_ENV === "development" && process.env.KLAVIYO_DEBUG_PROFILE === "true") {
        const drawProps = await calculateDrawSpecificPropertiesForUser(user);
        console.log(`✅ Profile synced for ${user.email}:`, {
          profileId: result.profile_id,
          drawProperties: drawProps,
        });
      }

      return true;
    }

    console.error(`❌ Failed to sync Klaviyo profile for ${user.email}:`, result.error);
    return false;
  } catch (error) {
    console.error(`❌ Error syncing Klaviyo profile for ${user.email}:`, error);
    return false;
  }
}

/**
 * Sync user profile to Klaviyo (non-blocking)
 * Use this for background operations where you don't want to wait
 *
 * @param user - User model instance
 * @param brandInterestFromSignup - Optional brand interest from signup
 * @param targetDraw - Optional cached target draw (for performance optimization)
 * @param cutoffDate - Optional cached cutoff date (for performance optimization)
 */
export function syncUserProfileToKlaviyoBackground(
  user: IUser,
  brandInterestFromSignup?: string | null,
  targetDraw?: IMajorDraw,
  cutoffDate?: Date
): void {
  syncUserProfileToKlaviyo(user, brandInterestFromSignup, targetDraw, cutoffDate).catch((error) => {
    // ✅ ENHANCED: Log timeout errors with more context but don't block
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMessage.toLowerCase().includes("timeout");
    
    if (isTimeout) {
      console.warn(`⚠️ Klaviyo profile sync timeout for ${user.email} (non-blocking):`, errorMessage);
      // Don't log as error - timeouts are expected and non-critical for background syncs
    } else {
      console.error(`❌ Background Klaviyo profile sync failed for ${user.email}:`, errorMessage);
    }
  });
}

/**
 * Throttle for the bulk profile sweep.
 *
 * Each `syncUserProfileToKlaviyo` hits the Klaviyo Profiles API ~twice — one
 * **Get Profiles** search (by email) + one **Create** or **Update** profile. Klaviyo's
 * rate limits are PER-ACCOUNT and PER-ENDPOINT: 75/s burst, ~700/min steady on each
 * profile endpoint (https://developers.klaviyo.com/en/reference/get_profiles). The
 * Get-Profiles search is the binding bucket (every user hits it once → ~700/min ≈ 11.6/s),
 * while create/update split across two separate buckets.
 *
 * Firing all users at once (the previous behaviour) blew past this — 429s + the undici
 * keep-alive socket pressure that caused the June 2026 "fetch failed" incident
 * (see lib/http/outbound.ts). Processing **8 concurrently with a 700ms pause** holds the
 * Get-Profiles rate around ~5–10/s — comfortably under the steady limit, ~2× faster than a
 * 5-at-a-time/2s baseline, and gentle on the socket pool. The Klaviyo client already backs
 * off on 429 via `Retry-After`, so a brief overshoot self-corrects.
 *
 * ⚠️ Run large sweeps OFF-PEAK — the per-account quota is shared with live registration
 * upserts. For a very large (whole-DB) sweep, prefer an ops script over an HTTP route
 * (a throttled sweep of thousands of users will exceed any serverless function limit), or
 * Klaviyo's Bulk Import Profiles endpoint (10k profiles/request, upsert).
 */
const CONCURRENT_SYNC_LIMIT = 8;
const BATCH_DELAY_MS = 700;

/**
 * Sync multiple users' profiles to Klaviyo, throttled to stay under Klaviyo's rate limits.
 * Useful for bulk operations or data migration. Each user's sync is best-effort
 * (`syncUserProfileToKlaviyo` swallows its own errors), so one failure never aborts the sweep.
 */
export async function syncMultipleUserProfilesToKlaviyo(users: IUser[]): Promise<void> {
  for (let i = 0; i < users.length; i += CONCURRENT_SYNC_LIMIT) {
    const batch = users.slice(i, i + CONCURRENT_SYNC_LIMIT);
    await Promise.allSettled(batch.map((user) => syncUserProfileToKlaviyo(user)));
    if (i + CONCURRENT_SYNC_LIMIT < users.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }
}

/**
 * Create Klaviyo profile and subscribe user during registration with retry logic
 *
 * This function properly handles the race condition by ensuring profile is created before subscription.
 * It includes retry logic following Klaviyo best practices to handle temporary API failures.
 *
 * Flow:
 * 1. Create/update profile in Klaviyo (with automatic retry on 502/504/5xx errors)
 * 2. Wait for profile creation to complete successfully
 * 3. Subscribe user to lists (only if profile creation succeeded)
 *
 * This replaces the setTimeout pattern which had race conditions where subscription could
 * fail if profile sync hadn't completed yet.
 *
 * Error Handling:
 * - Logs errors but doesn't throw (non-blocking - registration shouldn't fail due to Klaviyo)
 * - Uses retry logic internally for resilience during Klaviyo API outages
 *
 * When to use:
 * - During user registration (ONCE per user)
 * - When you need both profile creation AND subscription in sequence
 *
 * When NOT to use:
 * - For profile updates only (use syncUserProfileToKlaviyo instead)
 * - For re-subscribing users (respects unsubscribe preferences)
 *
 * @param user - User model instance
 * @param brandInterestFromSignup - Optional brand interest from signup (e.g., "milwaukee", "dewalt", "makita")
 *                                   Only used if user hasn't made any purchases yet
 */
export async function createKlaviyoProfileAndSubscribe(
  user: IUser,
  brandInterestFromSignup?: string | null
): Promise<void> {
  // Skip if Klaviyo is disabled
  if (process.env.KLAVIYO_ENABLED === "false") {
    return;
  }

  try {
    // Step 1: Create/update profile in Klaviyo (with retry logic built into upsertProfile)
    const profile = await userToKlaviyoProfile(user, brandInterestFromSignup);
    const klaviyoResult = await klaviyo.upsertProfile(profile);

    if (!klaviyoResult.success || !klaviyoResult.profile_id) {
      throw new Error(`Failed to create Klaviyo profile: ${klaviyoResult.error || "Unknown error"}`);
    }

    // Step 2: Subscribe user to lists (only if profile was created successfully)
    // This ensures we have a valid profile ID before subscribing
    await subscribeUserToKlaviyoOnRegistration(user, klaviyoResult.profile_id);

    console.log(`✅ Successfully created Klaviyo profile and subscribed user: ${user.email}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to create Klaviyo profile and subscribe user ${user.email}:`, errorMessage);
    // Don't throw - we don't want to block registration
  }
}

/**
 * Ensure user profile is synced after any user data change
 *
 * ⚠️ IMPORTANT: This function ONLY updates profile data, NOT subscription status.
 * Subscriptions are handled separately during registration to respect user unsubscribe preferences.
 *
 * This ensures that if a user manually unsubscribes via Klaviyo's unsubscribe link,
 * their profile data can still be updated without resubscribing them.
 *
 * For initial registration with subscription, use createKlaviyoProfileAndSubscribe() instead.
 *
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

/**
 * Merge the Klaviyo profile for `previousEmail` into the profile for `user.email` (after an email change).
 * Upserts the current user first so the destination profile exists. Non-throwing.
 */
export async function mergeKlaviyoProfilesAfterEmailChange(
  user: IUser,
  previousEmail: string | null | undefined
): Promise<{ merged: boolean; error?: string }> {
  if (process.env.KLAVIYO_ENABLED === "false") {
    return { merged: false };
  }

  const prev = previousEmail?.trim().toLowerCase();
  const next = user.email?.trim().toLowerCase();
  if (!prev || !next || prev === next) {
    return { merged: false };
  }

  try {
    await syncUserProfileToKlaviyo(user);

    const destId = await klaviyo.findProfileByEmail(next);
    const sourceId = await klaviyo.findProfileByEmail(prev);

    if (!sourceId) {
      return { merged: false };
    }

    if (!destId) {
      return { merged: false, error: "Destination Klaviyo profile not found after sync" };
    }

    if (sourceId === destId) {
      return { merged: true };
    }

    const result = await klaviyo.mergeProfiles(destId, sourceId);
    if (!result.success) {
      return { merged: false, error: result.error };
    }

    return { merged: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { merged: false, error: message };
  }
}
