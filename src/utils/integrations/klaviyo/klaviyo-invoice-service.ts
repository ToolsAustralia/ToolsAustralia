/**
 * Klaviyo Invoice Service
 *
 * Service layer for tracking invoice events in Klaviyo.
 * Abstracts invoice tracking logic from payment processing for better separation of concerns.
 *
 * This service handles individual invoice tracking (immediate, fire-and-forget send).
 *
 * As of the 2026-07 invoice-reliability change, the "Invoice Generated" event is emitted
 * server-side from `trackKlaviyoEvent` (in payment-processing.ts) for every charge, so it can
 * never be dropped by a client that navigates away. Each charge — new membership, one-time,
 * mini-draw, and an accepted upsell (its own separate charge) — gets its own receipt. There is
 * no longer a client-driven "combined invoice" / delay-until-upsell-decision path.
 *
 * Benefits:
 * - Separates invoice tracking from payment processing logic
 * - Reusable across different contexts
 * - Easier to test and maintain
 * - Keeps payment-processing.ts focused and maintainable
 *
 * @module utils/integrations/klaviyo/klaviyo-invoice-service
 */

import type { IUser } from "@/models/User";
import { klaviyo } from "@/lib/klaviyo";
import { createInvoiceGeneratedEvent } from "./klaviyo-events";
import { buildInvoiceData, type PackageData } from "./klaviyo-invoice-helpers";

/**
 * Whether the base "Invoice Generated" receipt should be emitted server-side for a charge
 * with the given Stripe `billing_reason`.
 *
 * We own the receipt for every charge EXCEPT the ones emitted elsewhere, which would
 * double-email the customer if also emitted here:
 *   - `subscription_cycle` / `subscription_threshold` (renewal) → owned by the
 *     "Subscription Renewed" → "Membership Renewal" Klaviyo flow. (Both billing reasons map
 *     to a renewal for the Subscription Renewed metric, so both are excluded here.)
 *   - `subscription_update` (upgrade) → owned by the `invoice.payment_succeeded` webhook,
 *     which emits an upgrade-specific "Invoice Generated" with the correct billing_reason.
 *
 * A missing/undefined billing_reason (one-time packs, mini-draws, accepted upsells) DOES emit.
 */
export function shouldEmitInvoiceGenerated(billingReason?: string): boolean {
  return (
    billingReason !== "subscription_cycle" &&
    billingReason !== "subscription_threshold" &&
    billingReason !== "subscription_update"
  );
}

/**
 * Track individual invoice (immediate send)
 *
 * Sends "Invoice Generated" event to Klaviyo for a single charge.
 *
 * @param user - User model instance
 * @param packageData - Package purchase data
 * @param paymentIntentId - Stripe payment intent ID
 * @returns Promise that resolves when event is queued (non-blocking)
 */
export async function trackInvoice(user: IUser, packageData: PackageData, paymentIntentId: string): Promise<void> {
  try {
    // Build invoice data using helper function
    const invoiceData = buildInvoiceData(packageData, paymentIntentId);

    // Create and track "Invoice Generated" event
    const event = createInvoiceGeneratedEvent(user, invoiceData);

    // Track event non-blocking (fire-and-forget)
    klaviyo.trackEventBackground(event);

    if (process.env.NODE_ENV === "development") {
      console.log(
        `✅ Klaviyo "Invoice Generated" event tracked: ${invoiceData.invoiceNumber} - $${invoiceData.totalAmount} AUD`
      );
    }
  } catch (error) {
    // Log error but don't throw - invoice tracking shouldn't break payment processing
    console.error(`❌ Failed to track "Invoice Generated" event for user ${user.email}:`, error);
  }
}
