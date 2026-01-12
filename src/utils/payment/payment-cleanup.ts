import connectDB from "@/lib/mongodb";
import User, { IUser } from "@/models/User";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { removePaymentMethodFromUser } from "./payment-method-manager";

/**
 * Payment Cleanup
 * 
 * Utility functions for cleaning up orphaned payment methods and accounts
 * when payments are cancelled or fail. This prevents accounts from being
 * created with payment methods when users cancel payment during processing.
 */

/**
 * Determines if a payment method should be removed from a user account
 * 
 * A payment method should be removed if:
 * - User has no successful payments (no accumulated entries, no active subscriptions, no one-time packages)
 * - The payment method was only used for the cancelled payment
 * 
 * @param user - User document to check
 * @returns True if payment method should be removed
 */
export function shouldRemovePaymentMethod(user: IUser): boolean {
  // Check if user has any successful payments
  const hasSuccessfulPayments =
    (user.accumulatedEntries && user.accumulatedEntries > 0) ||
    (user.subscription && user.subscription.isActive) ||
    (user.oneTimePackages && user.oneTimePackages.length > 0) ||
    (user.upsellPurchases && user.upsellPurchases.length > 0) ||
    (user.miniDrawPackages && user.miniDrawPackages.length > 0);

  // If user has successful payments, don't remove payment method
  // The payment method might be used for future purchases
  return !hasSuccessfulPayments;
}

/**
 * Removes an orphaned payment method from a user account
 * 
 * This is called when a payment is cancelled and the user has no successful payments.
 * The payment method was likely attached during a cancelled purchase attempt.
 * 
 * @param user - User document to remove payment method from
 * @param paymentMethodId - Stripe payment method ID to remove
 * @returns Success status
 */
export async function cleanupOrphanedPaymentMethod(
  user: IUser,
  paymentMethodId: string
): Promise<boolean> {
  try {
    await connectDB();

    const result = await removePaymentMethodFromUser(user, paymentMethodId);

    if (result.success) {
      console.log(
        `✅ Removed orphaned payment method ${paymentMethodId} from user ${user._id}`
      );
      return true;
    } else {
      console.error(
        `❌ Failed to remove orphaned payment method ${paymentMethodId} from user ${user._id}: ${result.error}`
      );
      return false;
    }
  } catch (error) {
    console.error("Error cleaning up orphaned payment method:", error);
    return false;
  }
}

/**
 * Main cleanup handler for cancelled payments
 * 
 * This function is called by the webhook when a payment_intent.canceled event is received.
 * It checks if the user has any successful payments, and if not, removes the payment method
 * that was attached during the cancelled purchase attempt.
 * 
 * @param paymentIntent - Cancelled Stripe PaymentIntent
 * @returns Success status
 */
export async function handlePaymentCancellation(
  paymentIntent: Stripe.PaymentIntent
): Promise<boolean> {
  try {
    await connectDB();

    console.log(`🔄 Processing payment cancellation cleanup: ${paymentIntent.id}`);

    // Find user by customer ID
    let user: IUser | null = null;

    if (paymentIntent.customer) {
      const customerId =
        typeof paymentIntent.customer === "string"
          ? paymentIntent.customer
          : paymentIntent.customer.id;

      user = await User.findOne({ stripeCustomerId: customerId });
    }

    // If user not found by customer ID, try email from metadata
    if (!user && paymentIntent.metadata.userEmail) {
      const userEmail = paymentIntent.metadata.userEmail.toLowerCase();
      if (userEmail !== "guest") {
        user = await User.findOne({ email: userEmail });
      }
    }

    if (!user) {
      console.log(
        `ℹ️ No user found for cancelled payment ${paymentIntent.id} - no cleanup needed`
      );
      return true; // Not an error - just no user to clean up
    }

    // Check if payment method should be removed
    if (!shouldRemovePaymentMethod(user)) {
      console.log(
        `ℹ️ User ${user._id} has successful payments - keeping payment method`
      );
      return true; // User has successful payments - keep payment method
    }

    // Get payment method ID from payment intent
    const paymentMethodId =
      typeof paymentIntent.payment_method === "string"
        ? paymentIntent.payment_method
        : paymentIntent.payment_method?.id;

    if (!paymentMethodId) {
      console.log(
        `ℹ️ No payment method in cancelled payment ${paymentIntent.id} - no cleanup needed`
      );
      return true; // No payment method to clean up
    }

    // Check if payment method is saved to user
    const hasPaymentMethod = user.savedPaymentMethods?.some(
      (pm) => pm.paymentMethodId === paymentMethodId
    );

    if (!hasPaymentMethod) {
      console.log(
        `ℹ️ Payment method ${paymentMethodId} not saved to user ${user._id} - no cleanup needed`
      );
      return true; // Payment method not saved - nothing to clean up
    }

    // Remove orphaned payment method
    const cleanupSuccess = await cleanupOrphanedPaymentMethod(user, paymentMethodId);

    if (cleanupSuccess) {
      console.log(
        `✅ Successfully cleaned up cancelled payment ${paymentIntent.id} for user ${user._id}`
      );
    }

    return cleanupSuccess;
  } catch (error) {
    console.error("Error handling payment cancellation:", error);
    return false;
  }
}

/**
 * Detaches a payment method from a Stripe customer when subscription creation fails
 * This prevents payment methods from being saved when initial subscription payments fail
 * (e.g., due to insufficient funds)
 * 
 * @param paymentMethodId - Stripe payment method ID to detach
 * @param customerId - Stripe customer ID that the payment method is attached to
 * @returns Success status and any error message
 */
export async function detachPaymentMethodOnFailure(
  paymentMethodId: string,
  customerId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Retrieve payment method to verify it's attached to this customer
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    const pmCustomerId = typeof paymentMethod.customer === "string" 
      ? paymentMethod.customer 
      : paymentMethod.customer?.id;
    
    // Only detach if it's attached to this customer
    if (pmCustomerId === customerId) {
      await stripe.paymentMethods.detach(paymentMethodId);
      console.log(`✅ Detached payment method ${paymentMethodId} from customer ${customerId} after payment failure`);
      return { success: true };
    } else {
      // Payment method not attached to this customer - nothing to do
      console.log(`ℹ️ Payment method ${paymentMethodId} not attached to customer ${customerId}, nothing to detach`);
      return { success: true };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`❌ Failed to detach payment method ${paymentMethodId}: ${errorMessage}`);
    return { success: false, error: errorMessage };
  }
}

/**
 * Removes a payment method from user's saved payment methods and detaches it from Stripe customer
 * This is used when subscription creation fails to prevent saving failed payment methods
 * 
 * @param user - User document to remove payment method from
 * @param paymentMethodId - Stripe payment method ID to remove
 * @returns Success status
 */
export async function cleanupFailedPaymentMethod(
  user: IUser,
  paymentMethodId: string
): Promise<boolean> {
  try {
    await connectDB();

    // Remove from user's saved payment methods if it exists
    if (user.savedPaymentMethods && user.savedPaymentMethods.length > 0) {
      const pmIndex = user.savedPaymentMethods.findIndex(pm => pm.paymentMethodId === paymentMethodId);
      if (pmIndex !== -1) {
        user.savedPaymentMethods.splice(pmIndex, 1);
        await user.save();
        console.log(`✅ Removed payment method ${paymentMethodId} from user ${user._id} saved payment methods`);
      }
    }

    // Detach from Stripe customer
    if (user.stripeCustomerId) {
      const detachResult = await detachPaymentMethodOnFailure(paymentMethodId, user.stripeCustomerId);
      if (detachResult.success) {
        console.log(`✅ Cleaned up payment method ${paymentMethodId} for user ${user._id}`);
        return true;
      } else {
        console.error(`❌ Failed to detach payment method: ${detachResult.error}`);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error(`❌ Error cleaning up failed payment method: ${error}`);
    return false;
  }
}

