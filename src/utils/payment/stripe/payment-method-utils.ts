/**
 * Payment Method Utilities
 *
 * This module provides utilities for managing Stripe payment methods.
 * Functions have clear single responsibility for separation of concerns.
 */

import { stripe } from "@/lib/stripe";
import Stripe from "stripe";
import type { IUser } from "@/models/User";

/**
 * Attaches a payment method to a Stripe customer
 *
 * @param paymentMethodId - Stripe payment method ID
 * @param customerId - Stripe customer ID
 * @throws Error if attachment fails
 */
export async function attachPaymentMethodToCustomer(
  paymentMethodId: string,
  customerId: string
): Promise<void> {
  try {
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    const pmCustomerId = typeof paymentMethod.customer === "string" ? paymentMethod.customer : paymentMethod.customer?.id;

    // Check if already attached to this customer
    if (pmCustomerId && pmCustomerId === customerId) {
      return; // Already attached, no-op
    }

    // Attach payment method to customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId,
    });

    console.log(`✅ Attached payment method ${paymentMethodId} to customer ${customerId}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = error && typeof error === "object" && "code" in error ? String(error.code) : undefined;

    // Check if error is due to payment method being "consumed"
    if (
      errorMessage.includes("previously used without being attached") ||
      errorMessage.includes("may not be used again")
    ) {
      throw new Error("Payment method cannot be reused - it was already used without being attached");
    }

    console.error(`❌ Failed to attach payment method ${paymentMethodId} to customer ${customerId}:`, error);
    throw new Error(`Failed to attach payment method: ${errorMessage}`);
  }
}

/**
 * Sets the default payment method for a Stripe customer
 *
 * @param customerId - Stripe customer ID
 * @param paymentMethodId - Stripe payment method ID
 */
export async function setDefaultPaymentMethod(
  customerId: string,
  paymentMethodId: string
): Promise<void> {
  try {
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    console.log(`✅ Set payment method ${paymentMethodId} as default for customer ${customerId}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Failed to set default payment method for customer ${customerId}:`, errorMessage);
    throw new Error(`Failed to set default payment method: ${errorMessage}`);
  }
}

/**
 * Verifies that a payment method is properly attached to a customer
 *
 * @param paymentMethodId - Stripe payment method ID
 * @param customerId - Stripe customer ID
 * @returns true if properly attached, false otherwise
 */
export async function verifyPaymentMethodAttachment(
  paymentMethodId: string,
  customerId: string
): Promise<boolean> {
  try {
    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    const pmCustomerId = typeof paymentMethod.customer === "string" ? paymentMethod.customer : paymentMethod.customer?.id;

    return pmCustomerId === customerId;
  } catch (error) {
    console.error(`❌ Failed to verify payment method attachment:`, error);
    return false;
  }
}

/**
 * Finds an available payment method for a customer using multiple fallback strategies
 * This consolidates the 3 sequential fallback strategies into one optimized function
 *
 * @param customer - Stripe customer object
 * @param user - User object (optional, for saved payment methods)
 * @returns Payment method ID or null if not found
 */
export async function findAvailablePaymentMethod(
  customer: Stripe.Customer,
  user: IUser | null
): Promise<string | null> {
  // Strategy 1: Customer's default payment method (fastest)
  const customerDefaultPm = (customer as {
    invoice_settings?: {
      default_payment_method?: string | Stripe.PaymentMethod;
    };
  }).invoice_settings?.default_payment_method;

  if (customerDefaultPm) {
    // ✅ FIX: Extract ID if it's an expanded PaymentMethod object
    const paymentMethodId =
      typeof customerDefaultPm === "string" ? customerDefaultPm : customerDefaultPm.id;

    console.log(`💳 Found payment method from customer default: ${paymentMethodId}`);
    return paymentMethodId;
  }

  // Strategy 2 & 3: Parallelize customer list and user saved methods
  const strategies = await Promise.allSettled([
    // Strategy 2: List customer's payment methods
    stripe.paymentMethods
      .list({
        customer: customer.id,
        type: "card",
        limit: 10,
      })
      .then((result) => {
        if (result.data.length > 0) {
          const sortedMethods = result.data.sort((a, b) => b.created - a.created);
          return sortedMethods[0].id;
        }
        return null;
      })
      .catch((error) => {
        console.warn(`⚠️ Failed to list customer payment methods:`, error);
        return null;
      }),

    // Strategy 3: User's saved payment methods
    (async () => {
      if (!user?.savedPaymentMethods || user.savedPaymentMethods.length === 0) {
        return null;
      }

      const savedMethod = user.savedPaymentMethods.find((pm: { isDefault?: boolean }) => pm.isDefault) 
        || user.savedPaymentMethods[0];

      if (!savedMethod?.paymentMethodId) {
        return null;
      }

      try {
        const pm = await stripe.paymentMethods.retrieve(savedMethod.paymentMethodId);
        const pmCustomerId = typeof pm.customer === "string" ? pm.customer : pm.customer?.id;

        // Auto-attach if not attached
        if (!pmCustomerId || pmCustomerId !== customer.id) {
          await stripe.paymentMethods.attach(savedMethod.paymentMethodId, {
            customer: customer.id,
          });
          console.log(`✅ Attached saved payment method to customer: ${savedMethod.paymentMethodId}`);
        }

        return savedMethod.paymentMethodId;
      } catch (error) {
        console.warn(`⚠️ Failed to use saved payment method:`, error);
        return null;
      }
    })(),
  ]);

  // Return first successful strategy result
  for (const strategy of strategies) {
    if (strategy.status === "fulfilled" && strategy.value) {
      const paymentMethodId = strategy.value;
      
      // Check if this is from the first strategy (customer list)
      const isFromCustomerList = strategies[0]?.status === "fulfilled" && strategies[0].value === paymentMethodId;
      
      if (isFromCustomerList) {
        console.log(`💳 Found payment method from customer payment methods list: ${paymentMethodId}`);
      } else {
        console.log(`💳 Using saved payment method as fallback: ${paymentMethodId}`);
      }
      
      return paymentMethodId;
    }
  }

  // No payment method found
  return null;
}
