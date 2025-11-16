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
  formatDateForKlaviyo,
  formatTimestampForKlaviyo,
} from "./klaviyo-helpers";

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
    paymentIntentId: string;
  }
): KlaviyoEvent {
  return {
    event: "Subscription Renewal Failed",
    customer_properties: getCustomerProperties(user),
    properties: {
      user_id: user._id.toString(),
      ...formatPackageDataForKlaviyo({
        packageId: packageData.packageId,
        packageName: packageData.packageName,
        tier: packageData.tier,
        price: 0, // No price for failed renewal
      }),
      failure_reason: packageData.failureReason,
      payment_intent_id: packageData.paymentIntentId,
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
 * Tracks when a user renews their subscription (failed payment recovery or reactivation)
 */
export function createSubscriptionRenewedEvent(
  user: IUser,
  renewalData: {
    packageId: string;
    packageName: string;
    tier: string;
    price: number;
    renewalType: "payment_retry" | "reactivation" | "new_subscription";
    previousStatus: string; // 'past_due', 'canceled', 'expired'
    paymentIntentId?: string;
    prorationAmount?: number;
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
      previous_status: renewalData.previousStatus,
      payment_intent_id: renewalData.paymentIntentId || "",
      proration_amount: renewalData.prorationAmount ? renewalData.prorationAmount.toFixed(2) : "0.00",
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
// INVOICE EVENTS
// ============================================================

/**
 * Create invoice generated event - ONLY for successful payments
 * This event should ONLY be triggered by webhook handlers after successful payment processing
 */
export function createInvoiceGeneratedEvent(
  user: IUser,
  invoiceData: {
    invoiceId: string;
    invoiceNumber: string;
    packageType: "subscription" | "one-time" | "upsell" | "mini-draw";
    packageId: string;
    packageName: string;
    packageTier?: string;
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
