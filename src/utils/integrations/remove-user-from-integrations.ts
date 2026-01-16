/**
 * Remove User from Third-Party Integrations
 *
 * Utility to remove users from all third-party integrations when deleted.
 * This ensures GDPR compliance and prevents orphaned data in external systems.
 *
 * @module utils/integrations/remove-user-from-integrations
 */

import { klaviyo } from "@/lib/klaviyo";
import { stripe } from "@/lib/stripe";
import type { IUser } from "@/models/User";

/**
 * Result of integration cleanup operations
 */
export interface IntegrationCleanupResult {
  klaviyo: {
    success: boolean;
    error?: string;
    operations: {
      profileFound?: boolean;
      unsubscribedEmail?: boolean;
      unsubscribedSMS?: boolean;
      removedFromLists?: boolean;
      deletedProfile?: boolean;
    };
  };
  stripe: {
    success: boolean;
    error?: string;
    customerDeleted?: boolean;
  };
}


/**
 * Remove user from all third-party integrations
 *
 * This function performs cleanup operations in the following order:
 * 1. Find Klaviyo profile by email
 * 2. Unsubscribe from email marketing
 * 3. Unsubscribe from SMS marketing (if phone exists)
 * 4. Remove from lists
 * 5. Delete Klaviyo profile (GDPR-compliant)
 * 6. Delete Stripe customer (if exists)
 *
 * All operations are non-blocking - errors are logged but don't throw.
 * This ensures user deletion can proceed even if third-party APIs are down.
 *
 * @param user - User model instance
 * @returns Cleanup result with success/failure status for each integration
 */
export async function removeUserFromIntegrations(
  user: IUser
): Promise<IntegrationCleanupResult> {
  const result: IntegrationCleanupResult = {
    klaviyo: {
      success: false,
      operations: {},
    },
    stripe: {
      success: false,
    },
  };

  // Format phone number for Klaviyo (ensure it starts with +61 for Australian numbers)
  const phoneNumber = user.mobile
    ? user.mobile.startsWith("+")
      ? user.mobile
      : `+61${user.mobile.replace(/^0/, "")}`
    : undefined;

  // ============================================================
  // KLAVIYO CLEANUP
  // ============================================================
  try {
    if (!user.email) {
      result.klaviyo.error = "User email is required for Klaviyo cleanup";
      console.warn("⚠️ Skipping Klaviyo cleanup - user email missing");
    } else {
      // Step 1: Find Klaviyo profile
      const profileId = await klaviyo.findProfileByEmail(user.email);
      result.klaviyo.operations.profileFound = !!profileId;

      if (profileId) {
        // Step 2: Unsubscribe from email marketing
        try {
          const emailUnsubResult = await klaviyo.unsubscribeFromEmailList(profileId, user.email);
          result.klaviyo.operations.unsubscribedEmail = emailUnsubResult.success;
          if (!emailUnsubResult.success) {
            console.warn(`⚠️ Failed to unsubscribe from email: ${emailUnsubResult.error}`);
          }
        } catch (error) {
          console.error(`❌ Error unsubscribing from email for ${user.email}:`, error);
        }

        // Step 3: Unsubscribe from SMS marketing (if phone exists)
        if (phoneNumber) {
          try {
            const smsUnsubResult = await klaviyo.unsubscribeFromSMSList(profileId, phoneNumber);
            result.klaviyo.operations.unsubscribedSMS = smsUnsubResult.success;
            if (!smsUnsubResult.success) {
              console.warn(`⚠️ Failed to unsubscribe from SMS: ${smsUnsubResult.error}`);
            }
          } catch (error) {
            console.error(`❌ Error unsubscribing from SMS for ${user.email}:`, error);
          }
        }

        // Step 4: Remove from lists
        try {
          const removeFromListsResult = await klaviyo.removeFromLists(profileId);
          result.klaviyo.operations.removedFromLists = removeFromListsResult.success;
          if (!removeFromListsResult.success) {
            console.warn(`⚠️ Failed to remove from lists: ${removeFromListsResult.error}`);
          }
        } catch (error) {
          console.error(`❌ Error removing from lists for ${user.email}:`, error);
        }
      }

      // Step 5: Delete profile (works even if profile ID not found - uses email/phone)
      // Note: This is an asynchronous operation - the profile will be deleted by Klaviyo
      // and may still be visible for a short time until the deletion job is processed
      try {
        console.log(`🔄 Requesting Klaviyo profile deletion for ${user.email}...`);
        const deleteResult = await klaviyo.deleteProfile(user.email, phoneNumber);
        result.klaviyo.operations.deletedProfile = deleteResult.success;
        if (!deleteResult.success) {
          console.error(`❌ Failed to delete Klaviyo profile for ${user.email}: ${deleteResult.error}`);
        } else {
          console.log(
            `✅ Klaviyo profile deletion job created for ${user.email}. Job ID: ${deleteResult.jobId}. ` +
              `Note: Profile deletion is asynchronous and may take a few minutes to complete in Klaviyo.`
          );
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`❌ Error deleting Klaviyo profile for ${user.email}:`, errorMessage);
        result.klaviyo.operations.deletedProfile = false;
      }

      // Mark Klaviyo cleanup as successful if at least one operation succeeded
      result.klaviyo.success = !!(
        result.klaviyo.operations.deletedProfile ||
        result.klaviyo.operations.unsubscribedEmail ||
        result.klaviyo.operations.unsubscribedSMS ||
        result.klaviyo.operations.removedFromLists
      );
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    result.klaviyo.error = errorMessage;
    console.error(`❌ Klaviyo cleanup failed for ${user.email}:`, errorMessage);
  }

  // ============================================================
  // STRIPE CLEANUP
  // ============================================================
  try {
    if (user.stripeCustomerId) {
      try {
        // Check if customer exists and has no active subscriptions
        const customer = await stripe.customers.retrieve(user.stripeCustomerId);

        // Check if customer was already deleted
        if ("deleted" in customer && customer.deleted) {
          console.log(`ℹ️ Stripe customer ${user.stripeCustomerId} already deleted`);
          result.stripe.success = true;
          result.stripe.customerDeleted = true;
        } else {
          // Check for active subscriptions before deletion
          const subscriptions = await stripe.subscriptions.list({
            customer: user.stripeCustomerId,
            limit: 10,
          });

          const hasActiveSubscriptions = subscriptions.data.some(
            (sub) => sub.status === "active" || sub.status === "trialing"
          );

          if (hasActiveSubscriptions) {
            console.warn(
              `⚠️ Skipping Stripe customer deletion - active subscriptions exist for ${user.stripeCustomerId}`
            );
            result.stripe.error = "Active subscriptions exist";
          } else {
            // Delete the customer
            await stripe.customers.del(user.stripeCustomerId);
            result.stripe.success = true;
            result.stripe.customerDeleted = true;
            console.log(`✅ Stripe customer deleted: ${user.stripeCustomerId}`);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        result.stripe.error = errorMessage;

        // Handle case where customer doesn't exist (404)
        if (error instanceof Error && error.message.includes("No such customer")) {
          console.log(`ℹ️ Stripe customer ${user.stripeCustomerId} not found (may already be deleted)`);
          result.stripe.success = true; // Not an error if already deleted
        } else {
          console.error(`❌ Error deleting Stripe customer ${user.stripeCustomerId}:`, errorMessage);
        }
      }
    } else {
      // No Stripe customer ID - nothing to clean up
      result.stripe.success = true;
      console.log(`ℹ️ No Stripe customer ID for user ${user.email} - skipping Stripe cleanup`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    result.stripe.error = errorMessage;
    console.error(`❌ Stripe cleanup failed for ${user.email}:`, errorMessage);
  }

  return result;
}
