/**
 * Invoice PaymentIntent Utilities
 *
 * This module provides utilities for retrieving and managing invoice PaymentIntents
 * for Stripe subscriptions. It handles retry logic and proper detection of
 * Stripe-created PaymentIntents to prevent duplicate creation.
 *
 * Best Practices:
 * - Wait for Stripe to create invoice PaymentIntent automatically
 * - Only create manual PaymentIntent as last resort
 * - Use retry logic to handle timing issues
 * - Properly finalize draft invoices before checking for PaymentIntent
 */

import { stripe } from "@/lib/stripe";
import Stripe from "stripe";

/**
 * Configuration for PaymentIntent detection retry logic
 */
const RETRY_CONFIG = {
  maxRetries: 5,
  retryDelayMs: 500, // Wait 500ms between retries
} as const;

/**
 * Result of invoice PaymentIntent retrieval
 */
export interface InvoicePaymentIntentResult {
  success: boolean;
  paymentIntent: Stripe.PaymentIntent | string | null;
  invoice: Stripe.Invoice;
  error?: string;
}

/**
 * Waits for a specified number of milliseconds
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retrieves invoice PaymentIntent with retry logic
 *
 * Stripe may take a moment to create the PaymentIntent after subscription creation.
 * This function retries with delays to ensure we detect the PaymentIntent when it's ready.
 *
 * @param invoiceId - Stripe invoice ID
 * @param subscriptionId - Stripe subscription ID (for logging, optional)
 * @returns Promise resolving to PaymentIntent result
 */
export async function getInvoicePaymentIntentWithRetry(
  invoiceId: string,
  subscriptionId?: string
): Promise<InvoicePaymentIntentResult> {
  let latestInvoice: Stripe.Invoice | null = null;
  let paymentIntent: Stripe.PaymentIntent | string | null | undefined = null;

  // Retry logic to wait for Stripe to create PaymentIntent
  for (let attempt = 0; attempt < RETRY_CONFIG.maxRetries; attempt++) {
    try {
      // Retrieve invoice with PaymentIntent expansion
      latestInvoice = await stripe.invoices.retrieve(invoiceId, {
        expand: ["payment_intent"],
      });

      // Extract PaymentIntent from invoice
      const invoiceWithPaymentIntent = latestInvoice as Stripe.Invoice & {
        payment_intent?: Stripe.PaymentIntent | string;
      };
      paymentIntent = invoiceWithPaymentIntent.payment_intent;

      // If PaymentIntent found, return immediately
      if (paymentIntent) {
        if (subscriptionId) {
          console.log(
            `✅ Found invoice PaymentIntent on attempt ${attempt + 1} for subscription ${subscriptionId}`
          );
        }
        return {
          success: true,
          paymentIntent,
          invoice: latestInvoice,
        };
      }

      // If this is not the last attempt, wait before retrying
      if (attempt < RETRY_CONFIG.maxRetries - 1) {
        await delay(RETRY_CONFIG.retryDelayMs);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to retrieve invoice ${invoiceId} on attempt ${attempt + 1}:`, errorMessage);

      // If this is the last attempt, return error with context
      if (attempt === RETRY_CONFIG.maxRetries - 1) {
        const contextInfo = subscriptionId ? ` (subscription: ${subscriptionId})` : "";
        return {
          success: false,
          paymentIntent: null,
          invoice: latestInvoice || ({} as Stripe.Invoice),
          error: `Failed to retrieve invoice ${invoiceId}${contextInfo} after ${RETRY_CONFIG.maxRetries} attempts: ${errorMessage}`,
        };
      }

      // Wait before retrying
      await delay(RETRY_CONFIG.retryDelayMs);
    }
  }

  // If we've exhausted all retries without finding PaymentIntent
  const contextInfo = subscriptionId ? ` (subscription: ${subscriptionId})` : "";
  return {
    success: false,
    paymentIntent: null,
    invoice: latestInvoice || ({} as Stripe.Invoice),
    error: `PaymentIntent not found in invoice ${invoiceId}${contextInfo} after ${RETRY_CONFIG.maxRetries} retries`,
  };
}

/**
 * Finalizes a draft invoice and retrieves PaymentIntent
 *
 * When subscription is created with payment_behavior: "default_incomplete",
 * Stripe creates a draft invoice. This function finalizes it and retrieves
 * the PaymentIntent.
 *
 * @param invoiceId - Stripe invoice ID
 * @param subscriptionId - Stripe subscription ID (for logging, optional)
 * @returns Promise resolving to PaymentIntent result
 */
export async function finalizeInvoiceAndGetPaymentIntent(
  invoiceId: string,
  subscriptionId?: string
): Promise<InvoicePaymentIntentResult> {
  try {
    // Finalize the draft invoice
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoiceId, {
      expand: ["payment_intent"],
    });

    if (subscriptionId) {
      console.log(
        `✅ Invoice finalized: ${finalizedInvoice.id}, status: ${finalizedInvoice.status} for subscription ${subscriptionId}`
      );
    }

    // Extract PaymentIntent from finalized invoice
    const invoiceWithPaymentIntent = finalizedInvoice as Stripe.Invoice & {
      payment_intent?: Stripe.PaymentIntent | string;
    };
    const paymentIntent = invoiceWithPaymentIntent.payment_intent;

    return {
      success: true,
      paymentIntent: paymentIntent || null,
      invoice: finalizedInvoice,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const contextInfo = subscriptionId ? ` (subscription: ${subscriptionId})` : "";
    console.error(`❌ Failed to finalize invoice ${invoiceId}${contextInfo}:`, errorMessage);
    return {
      success: false,
      paymentIntent: null,
      invoice: {} as Stripe.Invoice,
      error: `Failed to finalize invoice ${invoiceId}${contextInfo}: ${errorMessage}`,
    };
  }
}

/**
 * Gets PaymentIntent from subscription's latest invoice
 *
 * This is the main function to use for retrieving invoice PaymentIntent.
 * It handles:
 * 1. Checking if invoice is already expanded in subscription
 * 2. Finalizing draft invoices
 * 3. Retrying to detect PaymentIntent with delays
 *
 * @param subscription - Stripe subscription object (may have expanded invoice)
 * @param subscriptionId - Stripe subscription ID (for logging, optional)
 * @returns Promise resolving to PaymentIntent result
 */
export async function getInvoicePaymentIntentFromSubscription(
  subscription: Stripe.Subscription,
  subscriptionId?: string
): Promise<InvoicePaymentIntentResult> {
  // First, check if invoice is already expanded in subscription
  if (subscription.latest_invoice) {
    const latestInvoice =
      typeof subscription.latest_invoice === "string"
        ? null
        : (subscription.latest_invoice as Stripe.Invoice);

    if (latestInvoice) {
      // Invoice is expanded, check for PaymentIntent
      const invoiceWithPaymentIntent = latestInvoice as Stripe.Invoice & {
        payment_intent?: Stripe.PaymentIntent | string;
      };
      const paymentIntent = invoiceWithPaymentIntent.payment_intent;

      if (paymentIntent) {
        return {
          success: true,
          paymentIntent,
          invoice: latestInvoice,
        };
      }

      // If invoice is draft, finalize it
      if (latestInvoice.status === "draft") {
        // @ts-expect-error - TypeScript incorrectly flags optional parameter as required
        return await finalizeInvoiceAndGetPaymentIntent(latestInvoice.id, subscriptionId);
      }

      // If invoice is open but no PaymentIntent, try retry logic
      if (latestInvoice.status === "open") {
        // @ts-expect-error - TypeScript incorrectly flags optional parameter as required
        return await getInvoicePaymentIntentWithRetry(latestInvoice.id, subscriptionId);
      }
    }
  }

  // If we don't have the invoice yet, get invoice ID and retrieve it
  const invoiceId =
    typeof subscription.latest_invoice === "string"
      ? subscription.latest_invoice
      : subscription.latest_invoice?.id;

  if (!invoiceId) {
    const contextInfo = subscriptionId ? ` (subscription: ${subscriptionId})` : "";
    return {
      success: false,
      paymentIntent: null,
      invoice: {} as Stripe.Invoice,
      error: `No invoice ID found in subscription${contextInfo}`,
    };
  }

  // Retrieve invoice and check status
  try {
    const invoice = await stripe.invoices.retrieve(invoiceId, {
      expand: ["payment_intent"],
    });

    // If draft, finalize it
    if (invoice.status === "draft") {
      return await finalizeInvoiceAndGetPaymentIntent(invoiceId, subscriptionId);
    }

    // If open, use retry logic to find PaymentIntent
    if (invoice.status === "open") {
      return await getInvoicePaymentIntentWithRetry(invoiceId, subscriptionId);
    }

    // For other statuses, check if PaymentIntent exists
    const invoiceWithPaymentIntent = invoice as Stripe.Invoice & {
      payment_intent?: Stripe.PaymentIntent | string;
    };
    const paymentIntent = invoiceWithPaymentIntent.payment_intent;

    return {
      success: !!paymentIntent,
      paymentIntent: paymentIntent || null,
      invoice,
      error: paymentIntent ? undefined : `PaymentIntent not found in invoice ${invoiceId}${subscriptionId ? ` (subscription: ${subscriptionId})` : ""}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const contextInfo = subscriptionId ? ` (subscription: ${subscriptionId})` : "";
    return {
      success: false,
      paymentIntent: null,
      invoice: {} as Stripe.Invoice,
      error: `Failed to retrieve invoice ${invoiceId}${contextInfo}: ${errorMessage}`,
    };
  }
}
