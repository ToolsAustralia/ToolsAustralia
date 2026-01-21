/**
 * Subscription Utilities
 *
 * This module provides utilities for managing Stripe subscriptions.
 * Functions handle PaymentIntent retrieval and deduplication.
 */

import { stripe } from "@/lib/stripe";
import Stripe from "stripe";
import { getInvoicePaymentIntentFromSubscription } from "./invoice-payment-intent";

/**
 * Gets PaymentIntent from subscription's latest invoice
 * This is a wrapper around getInvoicePaymentIntentFromSubscription for consistency
 *
 * @param subscription - Stripe subscription object
 * @param subscriptionId - Stripe subscription ID (for logging)
 * @returns PaymentIntent object or null
 */
export async function getSubscriptionPaymentIntent(
  subscription: Stripe.Subscription,
  subscriptionId?: string
): Promise<Stripe.PaymentIntent | null> {
  const result = await getInvoicePaymentIntentFromSubscription(subscription, subscriptionId);

  if (!result.success || !result.paymentIntent) {
    return null;
  }

  // If PaymentIntent is a string ID, retrieve it
  if (typeof result.paymentIntent === "string") {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(result.paymentIntent);
      return paymentIntent;
    } catch (error) {
      console.error(`❌ Failed to retrieve PaymentIntent ${result.paymentIntent}:`, error);
      return null;
    }
  }

  return result.paymentIntent as Stripe.PaymentIntent;
}

/**
 * Cancels duplicate PaymentIntents for a subscription
 * This is non-blocking (fire-and-forget) to improve performance
 *
 * @param subscriptionId - Stripe subscription ID
 * @param customerId - Stripe customer ID
 * @param keepPaymentIntentId - PaymentIntent ID to keep (invoice PaymentIntent)
 */
export async function cancelDuplicatePaymentIntents(
  subscriptionId: string,
  customerId: string,
  keepPaymentIntentId: string
): Promise<void> {
  // Fire-and-forget: Don't block API response on deduplication
  Promise.resolve().then(async () => {
    try {
      const existingPaymentIntents = await stripe.paymentIntents.list({
        customer: customerId,
        limit: 100,
      });

      // Filter for duplicate PaymentIntents (same subscription, different PaymentIntent, cancellable)
      const duplicatePaymentIntents = existingPaymentIntents.data.filter((pi) => {
        const isSameSubscription = pi.metadata?.subscription_id === subscriptionId;
        const isNotInvoicePaymentIntent = pi.id !== keepPaymentIntentId;
        const isUpfrontPayment = pi.metadata?.isUpfrontPayment === "true";
        const isCancellable = [
          "requires_payment_method",
          "requires_confirmation",
          "requires_action",
          "requires_capture",
          "processing",
        ].includes(pi.status);
        const isNotSucceeded = pi.status !== "succeeded";
        const isNotCanceled = pi.status !== "canceled";

        return (
          isSameSubscription &&
          isNotInvoicePaymentIntent &&
          (isUpfrontPayment || isCancellable) &&
          isNotSucceeded &&
          isNotCanceled
        );
      });

      // Cancel all duplicate PaymentIntents
      for (const duplicatePI of duplicatePaymentIntents) {
        try {
          await stripe.paymentIntents.cancel(duplicatePI.id);
          console.log(
            `✅ Cancelled duplicate PaymentIntent ${duplicatePI.id} (status: ${duplicatePI.status}, isUpfront: ${duplicatePI.metadata?.isUpfrontPayment})`
          );
        } catch (cancelError) {
          console.warn(`⚠️ Could not cancel duplicate PaymentIntent ${duplicatePI.id}:`, cancelError);
        }
      }

      if (duplicatePaymentIntents.length > 0) {
        console.log(
          `✅ Deduplication: Cancelled ${duplicatePaymentIntents.length} duplicate PaymentIntent(s) for subscription ${subscriptionId}`
        );
      }
    } catch (dedupError) {
      // Non-blocking error - log but don't throw
      console.warn(`⚠️ Deduplication check failed (non-critical): ${dedupError}`);
    }
  });
}

/**
 * Verifies payment settlement without delays
 * Stripe webhooks will handle verification, so delays are unnecessary
 *
 * @param paymentIntentId - Stripe PaymentIntent ID
 * @returns PaymentIntent object with current status
 */
export async function verifyPaymentSettlement(
  paymentIntentId: string
): Promise<Stripe.PaymentIntent> {
  // Retrieve PaymentIntent immediately - no delay needed
  // Stripe webhooks handle settlement verification reliably
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

  if (paymentIntent.status === "succeeded") {
    console.log(`✅ Payment ${paymentIntentId} verified and settled`);
  } else {
    console.log(`ℹ️ Payment ${paymentIntentId} status: ${paymentIntent.status}`);
  }

  return paymentIntent;
}
