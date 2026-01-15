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
    // Note: Cannot expand nested properties like "latest_invoice.latest_payment_intent"
    // Instead, expand latest_invoice, then expand payment intents from the invoice
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ["latest_invoice"],
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
        expand: ["payment_intent"],
      });
    } else {
      // If invoice is expanded but payment intents might not be, try to expand them
      const invoiceId = latestInvoice.id;
      // Check if payment_intent or latest_payment_intent are already expanded
      const invoiceWithPI = latestInvoice as Stripe.Invoice & {
        payment_intent?: string | Stripe.PaymentIntent;
        latest_payment_intent?: string | Stripe.PaymentIntent;
      };
      
          // If payment intents are strings (not expanded), retrieve the invoice with expansion
          if (
            typeof invoiceWithPI.payment_intent === "string" ||
            typeof invoiceWithPI.latest_payment_intent === "string"
          ) {
            if (!invoiceId) {
              return {
                success: false,
                hasDefaultPaymentMethod: false,
                error: "Invoice ID is required but not found",
              };
            }
            invoice = await stripe.invoices.retrieve(invoiceId, {
              expand: ["payment_intent"],
            });
          } else {
            invoice = latestInvoice;
          }
        }

    // Check invoice status - should be "open" or "draft" for failed payments
    // "open" = invoice created and awaiting payment
    // "draft" = invoice created but not yet finalized (needs to be finalized first)
    if (invoice.status !== "open" && invoice.status !== "draft") {
      return {
        success: false,
        hasDefaultPaymentMethod: false,
        error: `Invoice is not in a payable state (status: ${invoice.status}). It may have already been paid or finalized.`,
      };
    }

    // Extract PaymentIntent from invoice
    let paymentIntent = extractPaymentIntentFromInvoice(invoice);
    
    // If PaymentIntent is not found but we have an ID string, retrieve it
    if (!paymentIntent) {
      const invoiceWithPI = invoice as Stripe.Invoice & {
        payment_intent?: string | Stripe.PaymentIntent;
        latest_payment_intent?: string | Stripe.PaymentIntent;
      };

      const paymentIntentIdString =
        typeof invoiceWithPI.payment_intent === "string"
          ? invoiceWithPI.payment_intent
          : typeof invoiceWithPI.latest_payment_intent === "string"
          ? invoiceWithPI.latest_payment_intent
          : null;

      if (paymentIntentIdString) {
        try {
          paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentIdString, {
            expand: ["payment_method"],
          });
        } catch (retrieveError) {
          console.error("Failed to retrieve PaymentIntent:", retrieveError);
          // Continue - we'll try to finalize the invoice or create a PaymentIntent later
        }
      }
    }
    
    // If still no PaymentIntent, the invoice might need to be finalized first
    // For subscription invoices with failed payments, draft invoices need to be finalized
    // Finalizing a draft invoice will create a PaymentIntent
    if (!paymentIntent && invoice.status === "draft" && invoice.id) {
      try {
        const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id, {
          expand: ["payment_intent"],
        });
        paymentIntent = extractPaymentIntentFromInvoice(finalizedInvoice);
        
        // If still not expanded, retrieve by ID
        if (!paymentIntent) {
          const finalizedWithPI = finalizedInvoice as Stripe.Invoice & {
            payment_intent?: string | Stripe.PaymentIntent;
            latest_payment_intent?: string | Stripe.PaymentIntent;
          };
          
          const paymentIntentIdString =
            typeof finalizedWithPI.payment_intent === "string"
              ? finalizedWithPI.payment_intent
              : typeof finalizedWithPI.latest_payment_intent === "string"
              ? finalizedWithPI.latest_payment_intent
              : null;

          if (paymentIntentIdString) {
            paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentIdString, {
              expand: ["payment_method"],
            });
          }
        }
      } catch (finalizeError) {
        console.error("Failed to finalize invoice:", finalizeError);
        // Continue - we'll return the invoice anyway and let the route handle it
      }
    }
    
    // If still no PaymentIntent, return the invoice anyway
    // The pay-failed-invoice route can attempt to pay the invoice directly,
    // which will create a PaymentIntent if needed
    if (!paymentIntent) {
      console.warn(
        `No PaymentIntent found for invoice ${invoice.id}. Invoice will be paid directly, which will create a PaymentIntent if needed.`
      );
    }

    // Check if customer has default payment method
    const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
    if (!customerId) {
      return {
        success: false,
        invoice,
        paymentIntent: paymentIntent || undefined,
        hasDefaultPaymentMethod: false,
        error: "No customer ID found on invoice",
      };
    }

    const hasDefaultPaymentMethod = await canPayWithDefaultMethod(customerId);

        return {
          success: true,
          invoice,
          paymentIntent: paymentIntent || undefined,
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


