/**
 * Klaviyo Invoice Service
 *
 * Service layer for tracking invoice events in Klaviyo.
 * Abstracts invoice tracking logic from payment processing for better separation of concerns.
 *
 * This service handles:
 * - Individual invoice tracking (immediate send)
 * - Combined invoice tracking (after upsell decision)
 * - Invoice delay determination (for upsells)
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
import {
  buildInvoiceData,
  buildCombinedInvoiceData,
  type PackageData,
  type PurchaseData,
  type UpsellPurchaseData,
  type PackageType,
} from "./klaviyo-invoice-helpers";
import { getUpsellPackagesForPurchase } from "@/data/upsellPackages";

/**
 * Determine if invoice should be delayed (for upsells)
 *
 * Checks if a purchase has eligible upsells or is an upsell itself.
 * If upsells exist, invoice should be delayed until after upsell decision.
 *
 * Memberships now delay invoices when upsells exist, just like one-time packages.
 * This ensures invoices are sent after the user makes their upsell decision (accept/decline)
 * or after a 30-second timeout.
 *
 * @param packageType - Type of package being purchased
 * @param packageId - Package ID to check for upsells
 * @returns True if invoice should be delayed, false otherwise
 */
export function shouldDelayInvoice(packageType: PackageType, packageId: string): boolean {
  // Always delay invoice for upsells - handled by finalization API
  if (packageType === "upsell") {
    return true;
  }

  // Check if purchase has eligible upsells (membership, one-time, mini-draw)
  // Memberships now delay invoices when upsells exist, just like one-time packages
  if (packageId && (packageType === "membership" || packageType === "one-time" || packageType === "mini-draw")) {
    // Map mini-draw to "one-time" for upsell lookups (as mini-draw is treated as one-time for upsells)
    // Map membership to "membership" for upsell lookups (upsells use "membership" not "subscription")
    const lookupPackageType = packageType === "mini-draw" ? "one-time" : packageType;
    const eligibleUpsells = getUpsellPackagesForPurchase(packageId, lookupPackageType);
    return eligibleUpsells.length > 0;
  }

  return false;
}

/**
 * Track individual invoice (immediate send)
 *
 * Sends "Invoice Generated" event to Klaviyo for individual purchases.
 * Used when invoice should be sent immediately (no upsells or upsell declined).
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

/**
 * Track combined invoice (after upsell decision)
 *
 * Sends "Invoice Generated" event to Klaviyo for combined invoices.
 * Used when invoice should be sent after upsell decision (combined original + upsell).
 *
 * @param user - User model instance
 * @param data - Combined invoice data including original purchase and optional upsell
 * @returns Promise that resolves when event is queued (non-blocking)
 */
export async function trackCombinedInvoice(
  user: IUser,
  data: {
    originalPurchase: PurchaseData;
    upsellPurchase?: UpsellPurchaseData;
  }
): Promise<void> {
  try {
    // Build combined invoice data using helper function
    const invoiceData = buildCombinedInvoiceData(data.originalPurchase, data.upsellPurchase);

    // Create and track "Invoice Generated" event
    const event = createInvoiceGeneratedEvent(user, invoiceData);

    // Track event non-blocking (fire-and-forget)
    klaviyo.trackEventBackground(event);

    if (process.env.NODE_ENV === "development") {
      console.log(
        `✅ Klaviyo combined "Invoice Generated" event tracked: ${invoiceData.invoiceNumber} - $${invoiceData.totalAmount} AUD (${invoiceData.items.length} items)`
      );
    }
  } catch (error) {
    // Log error but don't throw - invoice tracking shouldn't break payment processing
    console.error(`❌ Failed to track combined "Invoice Generated" event for user ${user.email}:`, error);
  }
}
