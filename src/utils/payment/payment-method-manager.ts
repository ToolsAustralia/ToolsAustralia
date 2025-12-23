import { stripe } from "@/lib/stripe";
import { IUser } from "@/models/User";

/**
 * Payment Method Manager
 * 
 * Utility functions for managing payment methods with clear separation of concerns.
 * These functions handle payment method operations after payment succeeds,
 * ensuring payment methods are only saved when payment is confirmed.
 */

/**
 * Saves a payment method to a user account after payment succeeds
 * 
 * @param user - User document to save payment method to
 * @param paymentMethodId - Stripe payment method ID
 * @param options - Optional configuration
 * @returns Object with success status and updated user
 */
export async function savePaymentMethodToUser(
  user: IUser,
  paymentMethodId: string,
  options: {
    setAsDefault?: boolean;
    skipStripeUpdate?: boolean;
  } = {}
): Promise<{
  success: boolean;
  user: IUser;
  wasNew: boolean;
  error?: string;
}> {
  try {
    // Check if payment method is already saved
    const existingPaymentMethod = user.savedPaymentMethods?.find(
      (pm) => pm.paymentMethodId === paymentMethodId
    );

    if (existingPaymentMethod) {
      // Payment method already exists - update lastUsed timestamp
      existingPaymentMethod.lastUsed = new Date();
      
      // Update default status if requested
      if (options.setAsDefault) {
        // Set all other payment methods to non-default
        user.savedPaymentMethods?.forEach((pm) => {
          pm.isDefault = pm.paymentMethodId === paymentMethodId;
        });
      }

      await user.save();
      return {
        success: true,
        user,
        wasNew: false,
      };
    }

    // Ensure payment method is attached to Stripe customer
    if (!options.skipStripeUpdate && user.stripeCustomerId) {
      await ensurePaymentMethodAttached(paymentMethodId, user.stripeCustomerId);
    }

    // Determine if this should be the default payment method
    // Set as default if it's the first payment method or explicitly requested
    const isFirstPaymentMethod = !user.savedPaymentMethods || user.savedPaymentMethods.length === 0;
    const shouldBeDefault = options.setAsDefault ?? isFirstPaymentMethod;

    // Set all other payment methods to non-default if this is being set as default
    if (shouldBeDefault && user.savedPaymentMethods) {
      user.savedPaymentMethods.forEach((pm) => {
        pm.isDefault = false;
      });
    }

    // Create new payment method data
    const newPaymentMethod = {
      paymentMethodId,
      isDefault: shouldBeDefault,
      createdAt: new Date(),
      lastUsed: new Date(),
    };

    // Add payment method to user
    if (!user.savedPaymentMethods) {
      user.savedPaymentMethods = [];
    }
    user.savedPaymentMethods.push(newPaymentMethod);

    // Update Stripe customer default payment method if needed
    if (shouldBeDefault && !options.skipStripeUpdate && user.stripeCustomerId) {
      await setDefaultPaymentMethod(user.stripeCustomerId, paymentMethodId);
    }

    await user.save();

    return {
      success: true,
      user,
      wasNew: true,
    };
  } catch (error) {
    console.error("Error saving payment method to user:", error);
    return {
      success: false,
      user,
      wasNew: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Removes a payment method from a user account
 * 
 * @param user - User document to remove payment method from
 * @param paymentMethodId - Stripe payment method ID to remove
 * @returns Object with success status and updated user
 */
export async function removePaymentMethodFromUser(
  user: IUser,
  paymentMethodId: string
): Promise<{
  success: boolean;
  user: IUser;
  error?: string;
}> {
  try {
    if (!user.savedPaymentMethods || user.savedPaymentMethods.length === 0) {
      return {
        success: true,
        user,
      };
    }

    // Find the payment method to remove
    const paymentMethodIndex = user.savedPaymentMethods.findIndex(
      (pm) => pm.paymentMethodId === paymentMethodId
    );

    if (paymentMethodIndex === -1) {
      // Payment method not found - nothing to remove
      return {
        success: true,
        user,
      };
    }

    const wasDefault = user.savedPaymentMethods[paymentMethodIndex].isDefault;

    // Remove the payment method
    user.savedPaymentMethods.splice(paymentMethodIndex, 1);

    // If the removed payment method was default, set the first remaining one as default
    if (wasDefault && user.savedPaymentMethods.length > 0) {
      user.savedPaymentMethods[0].isDefault = true;
      
      // Update Stripe customer default payment method
      if (user.stripeCustomerId) {
        await setDefaultPaymentMethod(
          user.stripeCustomerId,
          user.savedPaymentMethods[0].paymentMethodId
        );
      }
    } else if (wasDefault && user.savedPaymentMethods.length === 0 && user.stripeCustomerId) {
      // No payment methods left - clear default in Stripe
      try {
        await stripe.customers.update(user.stripeCustomerId, {
          invoice_settings: {
            default_payment_method: undefined,
          },
        });
      } catch (error) {
        console.error("Error clearing default payment method in Stripe:", error);
        // Non-critical error - continue
      }
    }

    await user.save();

    return {
      success: true,
      user,
    };
  } catch (error) {
    console.error("Error removing payment method from user:", error);
    return {
      success: false,
      user,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Ensures a payment method is attached to a Stripe customer
 * 
 * @param paymentMethodId - Stripe payment method ID
 * @param customerId - Stripe customer ID
 * @returns Success status
 */
export async function ensurePaymentMethodAttached(
  paymentMethodId: string,
  customerId: string
): Promise<boolean> {
  try {
    // Retrieve payment method to check current attachment
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);

    // Check if payment method is already attached to this customer
    const currentCustomerId =
      typeof paymentMethod.customer === "string"
        ? paymentMethod.customer
        : paymentMethod.customer?.id;

    if (currentCustomerId === customerId) {
      // Already attached to correct customer
      return true;
    }

    // Detach from current customer if attached to different customer
    if (currentCustomerId) {
      try {
        await stripe.paymentMethods.detach(paymentMethodId);
      } catch (detachError) {
        // Payment method might already be detached - continue
        console.warn("Payment method detach warning:", detachError);
      }
    }

    // Attach to the correct customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    return true;
  } catch (error) {
    console.error("Error ensuring payment method attachment:", error);
    return false;
  }
}

/**
 * Sets the default payment method for a Stripe customer and optionally updates user account
 * 
 * @param customerId - Stripe customer ID
 * @param paymentMethodId - Stripe payment method ID to set as default
 * @returns Success status
 */
export async function setDefaultPaymentMethod(
  customerId: string,
  paymentMethodId: string
): Promise<boolean> {
  try {
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    return true;
  } catch (error) {
    console.error("Error setting default payment method in Stripe:", error);
    return false;
  }
}

