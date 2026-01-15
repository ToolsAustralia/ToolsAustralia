/**
 * Failed Invoice Handler Utility
 *
 * Business logic for handling failed subscription renewal invoices.
 * This utility provides reusable functions for retrieving and processing failed invoices,
 * following Stripe best practices by reusing existing invoices and PaymentIntents.
 *
 * Key Principles:
 * - Reuses existing failed invoice (does not create new invoices)
 * - Reuses existing PaymentIntent from invoice
 * - Does not create new subscriptions or payment intents
 * - Trusts Stripe webhooks as source of truth
 */

import { stripe } from "@/lib/stripe";
import Stripe from "stripe";

/**
 * Result type for failed invoice payment data retrieval
 */
export interface FailedInvoicePaymentData {
  success: boolean;
  invoice?: Stripe.Invoice;
  paymentIntent?: Stripe.PaymentIntent;
  hasDefaultPaymentMethod: boolean;
  error?: string;
}

/**
 * Main function to retrieve failed invoice payment data
 *
 * This function retrieves the failed invoice from a subscription and extracts
 * the PaymentIntent, checking if the customer has a default payment method.
 *
 * @param subscriptionId - Stripe subscription ID
 * @returns Promise resolving to failed invoice payment data
 */
export async function getFailedInvoicePaymentData(
  subscriptionId: string
): Promise<FailedInvoicePaymentData> {
  try {
    // Retrieve subscription from Stripe with latest invoice expansion
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["latest_invoice", "latest_invoice.payment_intent", "latest_invoice.latest_payment_intent"],
    });

    // Get latest invoice
    const latestInvoice = subscription.latest_invoice;
    if (!latestInvoice) {
      return {
        success: false,
        hasDefaultPaymentMethod: false,
        error: "No invoice found for subscription",
      };
    }

    // Handle invoice (may be string or expanded object)
    let invoice: Stripe.Invoice;
    if (typeof latestInvoice === "string") {
      // Retrieve invoice if only ID is provided
      invoice = await stripe.invoices.retrieve(latestInvoice, {
        expand: ["payment_intent", "latest_payment_intent"],
      });
    } else {
      invoice = latestInvoice;
    }

    // Check invoice status - should be "open" for failed payments
    if (invoice.status !== "open") {
      return {
        success: false,
        hasDefaultPaymentMethod: false,
        error: `Invoice is not open (status: ${invoice.status}). It may have already been paid or finalized.`,
      };
    }

    // Extract PaymentIntent from invoice
    const paymentIntent = extractPaymentIntentFromInvoice(invoice);
    if (!paymentIntent) {
      return {
        success: false,
        invoice,
        hasDefaultPaymentMethod: false,
        error: "No PaymentIntent found for invoice",
      };
    }

    // Check if customer has default payment method
    const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
    if (!customerId) {
      return {
        success: false,
        invoice,
        paymentIntent,
        hasDefaultPaymentMethod: false,
        error: "No customer ID found on invoice",
      };
    }

    const hasDefaultPaymentMethod = await canPayWithDefaultMethod(customerId);

    return {
      success: true,
      invoice,
      paymentIntent,
      hasDefaultPaymentMethod,
    };
  } catch (error) {
    console.error("Error retrieving failed invoice payment data:", error);
    return {
      success: false,
      hasDefaultPaymentMethod: false,
      error: error instanceof Error ? error.message : "Unknown error retrieving invoice data",
    };
  }
}

/**
 * Check if customer can pay with default payment method
 *
 * @param customerId - Stripe customer ID
 * @returns Promise resolving to boolean indicating if customer has default payment method
 */
export async function canPayWithDefaultMethod(customerId: string): Promise<boolean> {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted) {
      return false;
    }

    // Check for default payment method in invoice_settings
    const customerWithSettings = customer as Stripe.Customer & {
      invoice_settings?: { default_payment_method?: string | Stripe.PaymentMethod };
    };

    const defaultPaymentMethod = customerWithSettings.invoice_settings?.default_payment_method;
    return !!defaultPaymentMethod;
  } catch (error) {
    console.error("Error checking default payment method:", error);
    return false;
  }
}

/**
 * Extract PaymentIntent from invoice
 *
 * This function handles multiple methods of extracting PaymentIntent from an invoice,
 * as Stripe may provide it in different fields depending on the invoice state.
 *
 * @param invoice - Stripe invoice object
 * @returns PaymentIntent if found, null otherwise
 */
export function extractPaymentIntentFromInvoice(invoice: Stripe.Invoice): Stripe.PaymentIntent | null {
  const invoiceWithPaymentIntent = invoice as Stripe.Invoice & {
    payment_intent?: string | Stripe.PaymentIntent;
    latest_payment_intent?: string | Stripe.PaymentIntent;
  };

  // Method 1: Try payment_intent field
  if (invoiceWithPaymentIntent.payment_intent) {
    if (typeof invoiceWithPaymentIntent.payment_intent === "string") {
      // Only ID provided - caller should retrieve if needed
      return null;
    }
    return invoiceWithPaymentIntent.payment_intent;
  }

  // Method 2: Try latest_payment_intent field
  if (invoiceWithPaymentIntent.latest_payment_intent) {
    if (typeof invoiceWithPaymentIntent.latest_payment_intent === "string") {
      // Only ID provided - caller should retrieve if needed
      return null;
    }
    return invoiceWithPaymentIntent.latest_payment_intent;
  }

  return null;
}

/**
 * Pay invoice with default payment method
 *
 * This function pays an invoice using the customer's default payment method.
 * It should only be called if canPayWithDefaultMethod returns true.
 *
 * @param invoiceId - Stripe invoice ID
 * @param customerId - Stripe customer ID
 * @returns Promise resolving to paid invoice
 */
export async function payInvoiceWithDefaultMethod(
  invoiceId: string,
  customerId: string
): Promise<Stripe.Invoice> {
  // Retrieve customer to get default payment method
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) {
    throw new Error("Customer has been deleted");
  }

  const customerWithSettings = customer as Stripe.Customer & {
    invoice_settings?: { default_payment_method?: string | Stripe.PaymentMethod };
  };

  const defaultPaymentMethod = customerWithSettings.invoice_settings?.default_payment_method;
  if (!defaultPaymentMethod) {
    throw new Error("No default payment method found for customer");
  }

  const paymentMethodId =
    typeof defaultPaymentMethod === "string" ? defaultPaymentMethod : defaultPaymentMethod.id;

  // Pay invoice with default payment method
  const paidInvoice = await stripe.invoices.pay(invoiceId, {
    payment_method: paymentMethodId,
  });

  return paidInvoice;
}


