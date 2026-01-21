/**
 * Customer Utilities
 *
 * This module provides utilities for managing Stripe customers.
 * Functions handle customer creation, retrieval, and payment method updates.
 */

import { stripe } from "@/lib/stripe";
import Stripe from "stripe";
import { attachPaymentMethodToCustomer, setDefaultPaymentMethod } from "./payment-method-utils";

/**
 * Ensures a Stripe customer exists, creating one if necessary
 *
 * @param email - Customer email
 * @param metadata - Customer metadata
 * @param existingCustomerId - Existing customer ID (optional)
 * @returns Stripe customer object
 */
export async function ensureCustomerExists(
  email: string,
  metadata: Record<string, string>,
  existingCustomerId?: string
): Promise<Stripe.Customer> {
  if (existingCustomerId) {
    try {
      const customer = await stripe.customers.retrieve(existingCustomerId);
      
      // Check if customer is deleted
      if ("deleted" in customer && customer.deleted) {
        throw new Error("Customer has been deleted");
      }

      return customer as Stripe.Customer;
    } catch (error) {
      console.warn(`⚠️ Failed to retrieve existing customer ${existingCustomerId}, creating new one:`, error);
      // Fall through to create new customer
    }
  }

  // Create new customer
  const customer = await stripe.customers.create({
    email,
    metadata,
  });

  console.log(`✅ Created new Stripe customer: ${customer.id}`);
  return customer;
}

/**
 * Updates customer payment method by attaching and setting as default
 * This parallelizes attach + update operations for better performance
 *
 * @param customerId - Stripe customer ID
 * @param paymentMethodId - Stripe payment method ID
 */
export async function updateCustomerPaymentMethod(
  customerId: string,
  paymentMethodId: string
): Promise<void> {
  // Parallelize payment method attachment and customer update
  await Promise.all([
    attachPaymentMethodToCustomer(paymentMethodId, customerId),
    setDefaultPaymentMethod(customerId, paymentMethodId),
  ]);

  console.log(`✅ Updated customer ${customerId} with payment method ${paymentMethodId}`);
}

/**
 * Retrieves a customer with default payment method expanded
 * Optimized retrieval with expand parameter
 *
 * @param customerId - Stripe customer ID
 * @returns Stripe customer object with expanded default payment method
 */
export async function getCustomerWithDefaultPaymentMethod(
  customerId: string
): Promise<Stripe.Customer> {
  const customer = await stripe.customers.retrieve(customerId, {
    expand: ["invoice_settings.default_payment_method"],
  }) as Stripe.Customer;

  // Check if customer is deleted
  if ("deleted" in customer && customer.deleted) {
    throw new Error("Customer has been deleted");
  }

  return customer;
}
