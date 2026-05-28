/**
 * Klaviyo Event Builders
 *
 * Factory functions to create properly formatted Klaviyo events.
 * Follows DRY principle - reusable event builders.
 *
 * Benefits:
 * - Type-safe event creation
 * - Consistent event structure
 * - Easy to add new events
 * - Centralized event logic
 *
 * @module utils/klaviyoEvents
 */

import type { KlaviyoEvent } from "@/types/klaviyo";
import type { IUser } from "@/models/User";
import {
  getCustomerProperties,
  formatInvoiceDataForKlaviyo,
  formatPackageDataForKlaviyo,
  formatCanonicalPackageData,
  formatDateForKlaviyo,
  formatTimestampForKlaviyo,
} from "./klaviyo-helpers";
import { buildRevenueProperties, buildRevenueItem, buildSubscriptionProperties } from "./klaviyo-revenue-schema";
import {
  getPartnerCatalogAccessPercentForPlanId,
  getPartnerDiscountCatalogSummaryForPackageId,
} from "@/utils/partner-discounts/partner-catalog-visibility";

// ============================================================
// ONBOARDING EVENTS
// ============================================================

export function createUserRegisteredEvent(
  user: IUser,
  registrationMethod: "email" | "google" | "facebook" = "email"
): KlaviyoEvent {
  return {
    event: "User Registered",
    customer_properties: getCustomerProperties(user),
    properties: {
      user_id: user._id.toString(),
      registration_method: registrationMethod,
      has_mobile: !!user.mobile,
      timestamp: formatTimestampForKlaviyo(),
    },
  };
}

// ============================================================
// SUBSCRIPTION EVENTS
// ============================================================

export function createSubscriptionStartedEvent(
  user: IUser,
  packageData: {
    packageId: string;
    packageName: string;
    tier: string;
    price: number;
    entriesGranted: number;
    paymentIntentId: string;
  }
): KlaviyoEvent {
  return {
    event: "Subscription Started",
    customer_properties: getCustomerProperties(user),
    properties: {
      user_id: user._id.toString(),
      ...formatPackageDataForKlaviyo({
        packageId: packageData.packageId,
        packageName: packageData.packageName,
        tier: packageData.tier,
        price: packageData.price,
      }),
      entries_granted: packageData.entriesGranted,
      auto_renew: user.subscription?.autoRenew || true,
      start_date: formatDateForKlaviyo(user.subscription?.startDate),
      end_date: formatDateForKlaviyo(user.subscription?.endDate),
      payment_intent_id: packageData.paymentIntentId,
      timestamp: formatTimestampForKlaviyo(),
    },
  };
}

export function createSubscriptionCancelledEvent(
  user: IUser,
  packageData: {
    packageId: string;
    packageName: string;
    tier: string;
  }
): KlaviyoEvent {
  const endDate = user.subscription?.endDate ? new Date(user.subscription.endDate) : new Date();
  const daysUntilExpiry = Math.max(0, Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  return {
    event: "Subscription Cancelled",
    customer_properties: getCustomerProperties(user),
    properties: {
      user_id: user._id.toString(),
      ...formatPackageDataForKlaviyo({
        packageId: packageData.packageId,
        packageName: packageData.packageName,
        tier: packageData.tier,
        price: 0, // No price for cancellation
      }),
      cancellation_date: formatDateForKlaviyo(),
      days_until_expiry: daysUntilExpiry,
      timestamp: formatTimestampForKlaviyo(),
    },
  };
}

export function createSubscriptionRenewalFailedEvent(
  user: IUser,
  packageData: {
    packageId: string;
    packageName: string;
    tier: string;
    failureReason: string;
    failureCode?: string;
    failureMessage?: string;
    amount: number;
    paymentIntentId: string;
    entries?: number; // Expected entries user should receive (lastMonthAccumulatedEntries + baseEntries)
    nextPaymentAttempt?: number | null; // Unix timestamp of next payment retry attempt
  }
): KlaviyoEvent {
  // Format next_payment_attempt as human-readable string if available, otherwise empty string
  // Format: "January 15, 2026 at 2:30 PM" (user-friendly format for email template)
  let nextPaymentAttemptFormatted = "";
  if (packageData.nextPaymentAttempt) {
    try {
      const date = new Date(packageData.nextPaymentAttempt * 1000);
      // Format as "January 15, 2026 at 2:30 PM"
      nextPaymentAttemptFormatted = date.toLocaleString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      // If date conversion fails, use ISO string as fallback
      try {
        nextPaymentAttemptFormatted = new Date(packageData.nextPaymentAttempt * 1000).toISOString();
      } catch {
        nextPaymentAttemptFormatted = packageData.nextPaymentAttempt.toString();
      }
    }
  }

  return {
    event: "Subscription Renewal Failed",
    customer_properties: getCustomerProperties(user),
    properties: {
      user_id: user._id.toString(),
      ...formatPackageDataForKlaviyo({
        packageId: packageData.packageId,
        packageName: packageData.packageName,
        tier: packageData.tier,
        price: packageData.amount, // Use actual amount for failed renewal
      }),
      failure_reason: packageData.failureReason,
      failure_code: packageData.failureCode || "",
      failure_message: packageData.failureMessage || "",
      amount: packageData.amount.toFixed(2),
      payment_intent_id: packageData.paymentIntentId,
      entries: packageData.entries !== undefined ? packageData.entries : 0, // Expected entries user should receive (number)
      entries_formatted: packageData.entries !== undefined ? packageData.entries.toLocaleString("en-US") : "0", // Formatted entries with commas (e.g., "1,100")
      next_payment_attempt: nextPaymentAttemptFormatted, // Human-readable date string (e.g., "January 15, 2026 at 2:30 PM"), or empty if null/exhausted
      timestamp: formatTimestampForKlaviyo(),
    },
  };
}

/**
 * Payment Failed Event - Generic event for any payment failure
 * Used for one-time packages, mini-draws, and upsells
 */
export function createPaymentFailedEvent(
  user: IUser,
  paymentData: {
    paymentIntentId: string;
    packageType: "one-time" | "upsell" | "mini-draw";
    packageId?: string;
    packageName?: string;
    amount: number;
    failureReason: string;
    failureCode?: string;
    failureMessage?: string;
  }
): KlaviyoEvent {
  return {
    event: "Payment Failed",
    customer_properties: getCustomerProperties(user),
    properties: {
      user_id: user._id.toString(),
      payment_intent_id: paymentData.paymentIntentId,
      package_type: paymentData.packageType,
      package_id: paymentData.packageId || "unknown",
      package_name: paymentData.packageName || "Unknown Package",
      amount: paymentData.amount.toFixed(2),
      failure_reason: paymentData.failureReason,
      failure_code: paymentData.failureCode || "",
      failure_message: paymentData.failureMessage || "",
      timestamp: formatTimestampForKlaviyo(),
    },
  };
}

/**
 * Subscription Payment Failed Event - For initial subscription payments
 * Distinct from renewal failures which use createSubscriptionRenewalFailedEvent
 */
export function createSubscriptionPaymentFailedEvent(
  user: IUser,
  paymentData: {
    paymentIntentId: string;
    packageId: string;
    packageName: string;
    tier: string;
    amount: number;
    failureReason: string;
    failureCode?: string;
    failureMessage?: string;
    isInitialPayment: boolean;
  }
): KlaviyoEvent {
  return {
    event: "Subscription Payment Failed",
    customer_properties: getCustomerProperties(user),
    properties: {
      user_id: user._id.toString(),
      ...formatPackageDataForKlaviyo({
        packageId: paymentData.packageId,
        packageName: paymentData.packageName,
        tier: paymentData.tier,
        price: paymentData.amount,
      }),
      payment_intent_id: paymentData.paymentIntentId,
      failure_reason: paymentData.failureReason,
      failure_code: paymentData.failureCode || "",
      failure_message: paymentData.failureMessage || "",
      is_initial_payment: paymentData.isInitialPayment,
      timestamp: formatTimestampForKlaviyo(),
    },
  };
}

export function createSubscriptionUpgradedEvent(
  user: IUser,
  upgradeData: {
    fromPackageId: string;
    fromPackageName: string;
    fromTier: string;
    fromPrice: number;
    toPackageId: string;
    toPackageName: string;
    toTier: string;
    toPrice: number;
    upgradeAmount: number;
    entriesAdded: number;
    paymentIntentId: string;
  }
): KlaviyoEvent {
  return {
    event: "Subscription Upgraded",
    customer_properties: getCustomerProperties(user),
    properties: {
      user_id: user._id.toString(),
      from_package_id: upgradeData.fromPackageId,
      from_package_name: upgradeData.fromPackageName?.trim() || "",
      from_tier: upgradeData.fromTier?.trim() || "",
      from_price: upgradeData.fromPrice.toFixed(2),
      to_package_id: upgradeData.toPackageId,
      to_package_name: upgradeData.toPackageName?.trim() || "",
      to_tier: upgradeData.toTier?.trim() || "",
      to_price: upgradeData.toPrice.toFixed(2),
      upgrade_amount: upgradeData.upgradeAmount.toFixed(2),
      entries_added: upgradeData.entriesAdded,
      payment_intent_id: upgradeData.paymentIntentId,
      upgrade_date: formatDateForKlaviyo(),
      timestamp: formatTimestampForKlaviyo(),
    },
  };
}

export function createSubscriptionDowngradedEvent(
  user: IUser,
  downgradeData: {
    fromPackageId: string;
    fromPackageName: string;
    fromTier: string;
    fromPrice: number;
    toPackageId: string;
    toPackageName: string;
    toTier: string;
    toPrice: number;
    effectiveDate: Date;
    daysUntilEffective: number;
  }
): KlaviyoEvent {
  return {
    event: "Subscription Downgraded",
    customer_properties: getCustomerProperties(user),
    properties: {
      user_id: user._id.toString(),
      from_package_id: downgradeData.fromPackageId,
      from_package_name: downgradeData.fromPackageName?.trim() || "",
      from_tier: downgradeData.fromTier?.trim() || "",
      from_price: downgradeData.fromPrice.toFixed(2),
      to_package_id: downgradeData.toPackageId,
      to_package_name: downgradeData.toPackageName?.trim() || "",
      to_tier: downgradeData.toTier?.trim() || "",
      to_price: downgradeData.toPrice.toFixed(2),
      effective_date: formatDateForKlaviyo(downgradeData.effectiveDate),
      days_until_effective: downgradeData.daysUntilEffective,
      downgrade_date: formatDateForKlaviyo(),
      timestamp: formatTimestampForKlaviyo(),
    },
  };
}

/**
 * ✅ NEW: Subscription Renewed Event
 * Tracks when a user renews their subscription (failed payment recovery, reactivation, or regular renewal)
 */
export function createSubscriptionRenewedEvent(
  user: IUser,
  renewalData: {
    packageId: string;
    packageName: string;
    tier: string;
    price: number;
    renewalType: "payment_retry" | "reactivation" | "new_subscription" | "subscription_cycle";
    previousStatus?: string; // 'past_due', 'canceled', 'expired', 'active' (optional for regular renewals)
    paymentIntentId?: string;
    prorationAmount?: number;
    entriesGranted?: number; // Entries granted during renewal
  }
): KlaviyoEvent {
  return {
    event: "Subscription Renewed",
    customer_properties: getCustomerProperties(user),
    properties: {
      user_id: user._id.toString(),
      ...formatPackageDataForKlaviyo({
        packageId: renewalData.packageId,
        packageName: renewalData.packageName,
        tier: renewalData.tier,
        price: renewalData.price,
      }),
      renewal_type: renewalData.renewalType,
      previous_status: renewalData.previousStatus || "active", // Default to "active" for regular renewals
      payment_intent_id: renewalData.paymentIntentId || "",
      proration_amount: renewalData.prorationAmount ? renewalData.prorationAmount.toFixed(2) : "0.00",
      entries_granted: renewalData.entriesGranted ?? 0, // Add entriesGranted to match Subscription Started event
      renewal_date: formatDateForKlaviyo(),
      auto_renew: user.subscription?.autoRenew || true,
      timestamp: formatTimestampForKlaviyo(),
    },
  };
}

/**
 * ✅ NEW: Subscription Upgraded with Proration Event
 * Enhanced version that includes proration details
 */
export function createSubscriptionUpgradedWithProrationEvent(
  user: IUser,
  upgradeData: {
    fromPackageId: string;
    fromPackageName: string;
    fromTier: string;
    fromPrice: number;
    toPackageId: string;
    toPackageName: string;
    toTier: string;
    toPrice: number;
    prorationAmount: number;
    upgradeAmount: number;
    entriesAdded: number;
    paymentIntentId: string;
  }
): KlaviyoEvent {
  return {
    event: "Subscription Upgraded",
    customer_properties: getCustomerProperties(user),
    properties: {
      user_id: user._id.toString(),
      from_package_id: upgradeData.fromPackageId,
      from_package_name: upgradeData.fromPackageName?.trim() || "",
      from_tier: upgradeData.fromTier?.trim() || "",
      from_price: upgradeData.fromPrice.toFixed(2),
      to_package_id: upgradeData.toPackageId,
      to_package_name: upgradeData.toPackageName?.trim() || "",
      to_tier: upgradeData.toTier?.trim() || "",
      to_price: upgradeData.toPrice.toFixed(2),
      proration_amount: upgradeData.prorationAmount.toFixed(2),
      upgrade_amount: upgradeData.upgradeAmount.toFixed(2),
      entries_added: upgradeData.entriesAdded,
      payment_intent_id: upgradeData.paymentIntentId,
      upgrade_date: formatDateForKlaviyo(),
      upgrade_method: "proration", // Indicates new best practice method
      timestamp: formatTimestampForKlaviyo(),
    },
  };
}

// ============================================================
// PACKAGE PURCHASE EVENTS
// ============================================================

export function createOneTimePackagePurchasedEvent(
  user: IUser,
  packageData: {
    packageId: string;
    packageName: string;
    price: number;
    entriesGranted: number;
    pointsEarned: number;
    paymentIntentId: string;
  }
): KlaviyoEvent {
  return {
    event: "One-Time Package Purchased",
    customer_properties: getCustomerProperties(user),
    properties: {
      user_id: user._id.toString(),
      ...formatPackageDataForKlaviyo({
        packageId: packageData.packageId,
        packageName: packageData.packageName,
        price: packageData.price,
      }),
      entries_granted: packageData.entriesGranted,
      points_earned: packageData.pointsEarned,
      payment_intent_id: packageData.paymentIntentId,
      purchase_date: formatDateForKlaviyo(),
      timestamp: formatTimestampForKlaviyo(),
    },
  };
}

export function createMiniDrawPurchasedEvent(
  user: IUser,
  packageData: {
    packageId: string;
    packageName: string;
    price: number;
    entriesGranted: number;
    partnerDiscountHours: number;
    partnerDiscountDays: number;
    paymentIntentId: string;
  }
): KlaviyoEvent {
  return {
    event: "Mini-Draw Package Purchased",
    customer_properties: getCustomerProperties(user),
    properties: {
      user_id: user._id.toString(),
      ...formatPackageDataForKlaviyo({
        packageId: packageData.packageId,
        packageName: packageData.packageName,
        price: packageData.price,
      }),
      entries_granted: packageData.entriesGranted,
      partner_discount_hours: packageData.partnerDiscountHours,
      partner_discount_days: packageData.partnerDiscountDays,
      payment_intent_id: packageData.paymentIntentId,
      purchase_date: formatDateForKlaviyo(),
      timestamp: formatTimestampForKlaviyo(),
    },
  };
}

// ============================================================
// UPSELL EVENTS
// ============================================================

export function createUpsellAcceptedEvent(
  user: IUser,
  upsellData: {
    offerId: string;
    offerTitle: string;
    amountPaid: number;
    entriesAdded: number;
    triggerEvent: string;
    paymentIntentId: string;
  }
): KlaviyoEvent {
  return {
    event: "Upsell Accepted",
    customer_properties: getCustomerProperties(user),
    properties: {
      user_id: user._id.toString(),
      offer_id: upsellData.offerId,
      offer_title: upsellData.offerTitle?.trim() || "",
      amount_paid: upsellData.amountPaid.toFixed(2),
      entries_added: upsellData.entriesAdded,
      trigger_event: upsellData.triggerEvent,
      payment_intent_id: upsellData.paymentIntentId,
      timestamp: formatTimestampForKlaviyo(),
    },
  };
}

// ============================================================
// MAJOR DRAW EVENTS
// ============================================================

export function createMajorDrawEntryAddedEvent(
  user: IUser,
  drawData: {
    majorDrawId: string;
    majorDrawName: string;
    entryCount: number;
    source: string;
    packageId: string;
    packageName: string;
    totalEntriesInDraw: number;
  }
): KlaviyoEvent {
  return {
    event: "Major Draw Entry Added",
    customer_properties: getCustomerProperties(user),
    properties: {
      user_id: user._id.toString(),
      major_draw_id: drawData.majorDrawId,
      major_draw_name: drawData.majorDrawName?.trim() || "",
      entry_count: drawData.entryCount,
      source: drawData.source,
      package_id: drawData.packageId,
      package_name: drawData.packageName?.trim() || "",
      total_entries_in_draw: drawData.totalEntriesInDraw,
      added_date: formatDateForKlaviyo(),
      timestamp: formatTimestampForKlaviyo(),
    },
  };
}

export function createMajorDrawWonEvent(
  user: IUser,
  drawData: {
    majorDrawId: string;
    majorDrawName: string;
    prizeName: string;
    prizeValue: number;
    entryNumber: number;
    totalEntries: number;
  }
): KlaviyoEvent {
  return {
    event: "Major Draw Won",
    customer_properties: getCustomerProperties(user),
    properties: {
      user_id: user._id.toString(),
      major_draw_id: drawData.majorDrawId,
      major_draw_name: drawData.majorDrawName?.trim() || "",
      prize_name: drawData.prizeName?.trim() || "",
      prize_value: drawData.prizeValue,
      entry_number: drawData.entryNumber,
      selected_date: formatDateForKlaviyo(),
      total_entries: drawData.totalEntries,
      timestamp: formatTimestampForKlaviyo(),
    },
  };
}

export function createMajorDrawEndedEvent(
  user: IUser,
  drawData: {
    majorDrawId: string;
    majorDrawName: string;
    userEntries: number;
    totalEntries: number;
    winnerUserId: string;
    won: boolean;
  }
): KlaviyoEvent {
  return {
    event: "Major Draw Ended",
    customer_properties: getCustomerProperties(user),
    properties: {
      user_id: user._id.toString(),
      major_draw_id: drawData.majorDrawId,
      major_draw_name: drawData.majorDrawName?.trim() || "",
      user_entries: drawData.userEntries,
      total_entries: drawData.totalEntries,
      winner_user_id: drawData.winnerUserId,
      won: drawData.won,
      end_date: formatDateForKlaviyo(),
      timestamp: formatTimestampForKlaviyo(),
    },
  };
}

// ============================================================
// REVENUE EVENTS (Standard Klaviyo Events for Revenue Metrics)
// ============================================================

/**
 * Create "Placed Order" event - Standard Klaviyo event for revenue tracking
 *
 * This is REQUIRED for Klaviyo's revenue metrics to work correctly.
 * This event works alongside custom events (Subscription Started, One-Time Package Purchased, etc.)
 *
 * - Custom events: For business logic and workflows
 * - Placed Order: For revenue metrics and analytics
 *
 * CRITICAL: Revenue is calculated ONLY from top-level `$value` property.
 * Any other property name (value, amount, price) is ignored for revenue.
 *
 * @param user - User model instance
 * @param orderData - Order data including value, currency, order ID, and package details
 * @returns Formatted Klaviyo event
 */
export function createPlacedOrderEvent(
  user: IUser,
  orderData: {
    orderId: string; // Unique order identifier (generated via klaviyo-order-helpers)
    value: number; // Purchase amount in dollars
    currency: string; // Currency code (e.g., "AUD")
    packageType: "membership" | "one-time" | "mini-draw" | "upsell";
    packageId: string;
    packageName: string;
    entriesGranted?: number;
    pointsEarned?: number;
    paymentIntentId?: string;
    /**
     * Raw Stripe `invoice.billing_reason` (e.g. "subscription_create",
     * "subscription_cycle", "subscription_update", "manual"). Emitted as a
     * top-level `billing_reason` event property. Omitted from the payload
     * when undefined so the property isn't created on Klaviyo profiles for
     * non-Stripe order paths.
     */
    billingReason?: string;
    /**
     * Whether this Placed Order is an automated subscription renewal cycle.
     * Always emitted as `is_renewal` (defaults to `false`) so segments and
     * custom metrics can reliably filter ("EQUALS true" / "EQUALS false").
     */
    isRenewal?: boolean;
  }
): KlaviyoEvent {
  // Build core revenue properties using schema helper ($value, Currency, Order ID)
  const revenueProperties = buildRevenueProperties(orderData.orderId, orderData.value, orderData.currency);

  // Build product item for items array (enables product-level analytics)
  const revenueItem = buildRevenueItem(orderData.packageId, orderData.packageName, orderData.value, 1);

  // Build subscription-specific properties for membership purchases
  const subscriptionProperties = orderData.packageType === "membership" ? buildSubscriptionProperties("monthly") : {};

  const partnerDiscountCatalogPercent = getPartnerCatalogAccessPercentForPlanId(orderData.packageId);

  return {
    event: "Placed Order",
    customer_properties: getCustomerProperties(user),
    properties: {
      // REQUIRED fields
      user_id: user._id.toString(),

      // REQUIRED fields for Klaviyo revenue metrics
      // Using schema helper ensures correct field names: $value, Currency, "Order ID"
      ...revenueProperties,

      // Items array for product-level analytics (does not affect total revenue)
      items: [revenueItem],

      // Subscription-specific properties for membership purchases
      // Enables subscription segmentation and recurring revenue analysis
      ...subscriptionProperties,

      // Custom properties for segmentation and analytics
      package_type: orderData.packageType,
      package_id: orderData.packageId,
      package_name: orderData.packageName,
      entries_granted: orderData.entriesGranted,
      points_earned: orderData.pointsEarned,
      payment_intent_id: orderData.paymentIntentId,
      partner_discount_catalog_percent: partnerDiscountCatalogPercent,
      partner_discount_catalog_summary: getPartnerDiscountCatalogSummaryForPackageId(orderData.packageId),
      purchase_date: formatDateForKlaviyo(),
      // Renewal discriminator — additive. `is_renewal` is always defined so
      // segments can use `EQUALS false` (Klaviyo treats missing properties as
      // "not set", which doesn't match `EQUALS false`). `billing_reason` is
      // only set when Stripe supplied one, keeping non-Stripe order paths
      // clean of an empty Klaviyo profile property.
      is_renewal: orderData.isRenewal ?? false,
      ...(orderData.billingReason ? { billing_reason: orderData.billingReason } : {}),
      timestamp: formatTimestampForKlaviyo(),
    },
  };
}

/**
 * Create "Refunded Order" event - Standard Klaviyo event for refund tracking
 *
 * This ensures revenue metrics correctly subtract refunds from total revenue.
 * The "Order ID" MUST match the original "Placed Order" event's "Order ID".
 *
 * CRITICAL: Revenue is calculated ONLY from top-level `$value` property.
 * Negative $value subtracts from total revenue.
 *
 * @param user - User model instance
 * @param refundData - Refund data including original order ID, refund amount, and reason
 * @returns Formatted Klaviyo event
 */
export function createRefundedOrderEvent(
  user: IUser,
  refundData: {
    originalOrderId: string; // MUST match the original "Placed Order" "Order ID"
    refundAmount: number; // Refund amount in dollars
    currency: string; // Currency code (e.g., "AUD")
    refundReason?: string; // Reason for refund (e.g., "customer_request", "chargeback")
    packageType: "membership" | "one-time" | "mini-draw" | "upsell";
  }
): KlaviyoEvent {
  // Build core revenue properties using schema helper
  // Negative $value subtracts from total revenue in Klaviyo
  const revenueProperties = buildRevenueProperties(
    refundData.originalOrderId,
    -refundData.refundAmount, // Negative value to subtract from revenue
    refundData.currency
  );

  return {
    event: "Refunded Order",
    customer_properties: getCustomerProperties(user),
    properties: {
      // REQUIRED fields
      user_id: user._id.toString(),

      // REQUIRED fields for Klaviyo revenue metrics
      // Using schema helper ensures correct field names: $value, Currency, "Order ID"
      ...revenueProperties,

      // Refund-specific properties
      refund_amount: refundData.refundAmount,
      refund_reason: refundData.refundReason || "customer_request",

      // Custom properties
      package_type: refundData.packageType,
      refund_date: formatDateForKlaviyo(),
      timestamp: formatTimestampForKlaviyo(),
    },
  };
}

// ============================================================
// INVOICE EVENTS
// ============================================================

/**
 * Create invoice generated event - ONLY for successful payments
 *
 * This event builder is used by the invoice service layer (klaviyo-invoice-service.ts)
 * to create "Invoice Generated" events for Klaviyo email flows.
 *
 * Should NOT be called directly from payment processing code.
 * Use trackInvoice() or trackCombinedInvoice() from klaviyo-invoice-service.ts instead.
 */
export function createInvoiceGeneratedEvent(
  user: IUser,
  invoiceData: {
    invoiceId: string;
    invoiceNumber: string;
    packageType: "membership" | "one-time" | "upsell" | "mini-draw";
    packageId: string;
    packageName: string;
    packageTier?: string;
    partnerDiscountCatalogPercent?: number;
    totalAmount: number;
    paymentIntentId: string;
    billingReason?: string;
    entries_gained: number;
    items: Array<{
      description: string;
      quantity: number;
      unit_price: number;
      total_price: number;
    }>;
  }
): KlaviyoEvent {
  return {
    event: "Invoice Generated",
    customer_properties: getCustomerProperties(user),
    properties: {
      user_id: user._id.toString(),
      ...formatInvoiceDataForKlaviyo(invoiceData),
    },
  };
}

// ============================================================
// POST-2026-05 CANONICAL EVENTS
//
// Events below this line use the CANONICAL property schema described in
// docs/tracking/KLAVIYO_INTEGRATION.md ("Canonical property names — new
// events only"):
//   - `price` is a NUMBER, not string
//   - `tier` is the property name (NOT package_tier)
//   - `package_type` is always emitted
//   - timestamps use `<verb>_at` ISO (NOT locale strings or `timestamp`)
//   - optional properties are OMITTED when absent (NOT `""` or `"unknown"`)
//
// The `canonical-events-shape.test.ts` snapshot test enforces these rules.
// Do NOT use `formatPackageDataForKlaviyo` (legacy) here — use
// `formatCanonicalPackageData` (added 2026-05-28) instead.
// ============================================================

/**
 * Create a "Viewed Giveaway" event — fires when a user views a /promotions/<slug>
 * page. Powers the ads team's "viewed promo but didn't enter" Klaviyo flow.
 *
 * Coexists with the existing `Viewed Page` (`PageType: "promotion"`) event from
 * KlaviyoPageTracker — does not replace it. The richer properties on this event
 * (promo title, prize name, prize image URL) let email templates render the
 * specific promo's assets rather than just a slug.
 *
 * For cookied users Klaviyo's onsite snippet auto-attaches the event to their
 * known profile. For never-cookied anonymous users the event lands as anonymous
 * in Klaviyo until they later identify.
 *
 * @param userOrEmail - Full IUser when identified, or `{ email }` when only
 *   email is known (e.g. after step-1 registration before session is set).
 * @param promoData - Resolved promo metadata for the page being viewed.
 */
export function createViewedGiveawayEvent(
  userOrEmail: IUser | { email: string; firstName?: string; lastName?: string },
  promoData: {
    promoSlug: string;
    promoId?: string;
    promoTitle: string;
    prizeName: string;
    prizeImageUrl?: string;
    promoUrl: string;
    isAuthenticated: boolean;
  }
): KlaviyoEvent {
  const customer_properties =
    "_id" in userOrEmail
      ? getCustomerProperties(userOrEmail)
      : {
          email: userOrEmail.email,
          ...(userOrEmail.firstName ? { first_name: userOrEmail.firstName } : {}),
          ...(userOrEmail.lastName ? { last_name: userOrEmail.lastName } : {}),
        };

  return {
    event: "Viewed Giveaway",
    customer_properties,
    properties: {
      // Omit user_id entirely when not available — no `""` sentinel (canonical rule)
      ...("_id" in userOrEmail ? { user_id: userOrEmail._id.toString() } : {}),
      promo_slug: promoData.promoSlug,
      ...(promoData.promoId ? { promo_id: promoData.promoId } : {}),
      promo_title: promoData.promoTitle,
      prize_name: promoData.prizeName,
      ...(promoData.prizeImageUrl ? { prize_image_url: promoData.prizeImageUrl } : {}),
      promo_url: promoData.promoUrl,
      is_authenticated: promoData.isAuthenticated,
      viewed_at: new Date().toISOString(),
    },
  };
}
