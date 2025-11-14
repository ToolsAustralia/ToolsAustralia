import { stripe } from "@/lib/stripe";
import { IUser } from "@/models/User";
import Stripe from "stripe";

/**
 * ✅ BEST PRACTICE: Validate and clean up payment methods for a user
 * This handles test environment issues where payment methods might be shared across customers
 */
export async function validateAndCleanupPaymentMethods(user: IUser): Promise<{
  validPaymentMethods: IUser["savedPaymentMethods"];
  cleanedUp: boolean;
}> {
  if (!user.savedPaymentMethods || user.savedPaymentMethods.length === 0) {
    return { validPaymentMethods: [], cleanedUp: false };
  }

  const validPaymentMethods: IUser["savedPaymentMethods"] = [];
  let cleanedUp = false;

  for (const savedPm of user.savedPaymentMethods) {
    try {
      const pm = await stripe.paymentMethods.retrieve(savedPm.paymentMethodId);

      // Check if payment method is attached to the correct customer
      if (pm.customer === user.stripeCustomerId!) {
        validPaymentMethods.push(savedPm);
      } else {
        // ✅ BEST PRACTICE: Try to fix the payment method by reattaching it
        if (process.env.NODE_ENV === "development" || process.env.STRIPE_ENVIRONMENT === "test") {
          try {
            console.log(
              `🔄 [TEST ENV] Attempting to fix payment method ${savedPm.paymentMethodId} - reattaching to correct customer`
            );

            // Detach from current customer first
            if (pm.customer) {
              await stripe.paymentMethods.detach(pm.id);
              console.log(`🔓 Detached payment method from customer: ${pm.customer}`);
            }

            // Attach to our customer
            await stripe.paymentMethods.attach(pm.id, {
              customer: user.stripeCustomerId!,
            });

            validPaymentMethods.push(savedPm);
            cleanedUp = true;
            console.log(`✅ Successfully fixed payment method - now attached to correct customer`);
          } catch {
            console.log(`❌ Failed to fix payment method - removing from user profile`);
            cleanedUp = true;
          }
        } else {
          console.log(`🗑️ Removing payment method ${savedPm.paymentMethodId} - not attached to customer (production)`);
          cleanedUp = true;
        }
      }
    } catch {
      console.log(`🗑️ Removing payment method ${savedPm.paymentMethodId} - no longer exists`);
      cleanedUp = true;
    }
  }

  // Update user's payment methods if we cleaned up any
  if (cleanedUp) {
    user.savedPaymentMethods = validPaymentMethods;
    await user.save();
    console.log(
      `✅ Cleaned up payment methods: kept ${validPaymentMethods.length} valid, removed ${
        user.savedPaymentMethods.length - validPaymentMethods.length
      } invalid`
    );
  }

  return { validPaymentMethods, cleanedUp };
}

/**
 * ✅ BEST PRACTICE: Get a valid payment method for a user
 * Handles test environment edge cases and provides fallback options
 */
export async function getValidPaymentMethod(
  user: IUser,
  preferredPaymentMethodId?: string
): Promise<{
  paymentMethod: Stripe.PaymentMethod | null;
  requiresSetupIntent: boolean;
  setupIntent?: {
    id: string;
    clientSecret: string;
  };
}> {
  // First, validate and clean up existing payment methods
  const { validPaymentMethods } = await validateAndCleanupPaymentMethods(user);

  // If user provided a specific payment method, try to use it
  if (preferredPaymentMethodId) {
    try {
      const pm = await stripe.paymentMethods.retrieve(preferredPaymentMethodId);
      if (pm.customer === user.stripeCustomerId!) {
        return { paymentMethod: pm, requiresSetupIntent: false };
      }
    } catch {
      console.log(`❌ Preferred payment method ${preferredPaymentMethodId} not valid`);
    }
  }

  // Try to find a valid payment method from the cleaned list
  for (const savedPm of validPaymentMethods) {
    try {
      const pm = await stripe.paymentMethods.retrieve(savedPm.paymentMethodId);
      if (pm.customer === user.stripeCustomerId!) {
        return { paymentMethod: pm, requiresSetupIntent: false };
      }
    } catch {
      console.log(`❌ Payment method ${savedPm.paymentMethodId} not valid`);
    }
  }

  // ✅ BEST PRACTICE: Try to fix existing payment methods by reattaching them
  // Since users have unique payment methods, the issue is likely detachment/reattachment
  console.log(`🔧 Attempting to fix existing payment methods for user`);

  for (const savedPm of user.savedPaymentMethods || []) {
    try {
      console.log(`🔧 Checking payment method: ${savedPm.paymentMethodId}`);

      const pm = await stripe.paymentMethods.retrieve(savedPm.paymentMethodId);

      // If payment method exists but is not attached to this customer
      if (pm.customer !== user.stripeCustomerId) {
        console.log(
          `🔄 Payment method ${savedPm.paymentMethodId} not attached to correct customer (${pm.customer} vs ${user.stripeCustomerId})`
        );

        // Try to reattach it (this should work for both test and production)
        console.log(`🔄 Reattaching payment method to correct customer`);

        // Detach from current customer (if any)
        if (pm.customer) {
          await stripe.paymentMethods.detach(pm.id);
          console.log(`🔓 Detached payment method from customer: ${pm.customer}`);
        }

        // Attach to our customer
        const reattachedPm = await stripe.paymentMethods.attach(pm.id, {
          customer: user.stripeCustomerId!,
        });

        console.log(`✅ Successfully reattached payment method to correct customer`);

        return {
          paymentMethod: reattachedPm,
          requiresSetupIntent: false,
        };
      } else {
        // Payment method is correctly attached
        console.log(`✅ Payment method ${savedPm.paymentMethodId} is correctly attached to customer`);

        return {
          paymentMethod: pm,
          requiresSetupIntent: false,
        };
      }
    } catch (error) {
      console.log(`⚠️ Could not retrieve payment method ${savedPm.paymentMethodId}:`, error);
      continue;
    }
  }

  console.log(`⚠️ Could not fix any existing payment methods, falling back to setup intent`);

  // No valid payment methods found - create setup intent
  try {
    const setupIntent = await stripe.setupIntents.create({
      customer: user.stripeCustomerId!,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: {
        userId: user._id.toString(),
        userEmail: user.email,
        purpose: "payment_method_setup",
      },
    });

    return {
      paymentMethod: null,
      requiresSetupIntent: true,
      setupIntent: {
        id: setupIntent.id,
        clientSecret: setupIntent.client_secret!,
      },
    };
  } catch {
    console.error(`❌ Failed to create setup intent`);
    return { paymentMethod: null, requiresSetupIntent: true };
  }
}
