/**
 * Pixel Purchase Tracking Utilities
 *
 * Provides server-side pixel tracking for all purchase events.
 * This ensures pixel events are fired for every purchase type.
 * Now includes Conversions API integration for accurate revenue tracking.
 *

 * @version 2.0.0
 */

import { trackFacebookEvent } from "@/components/FacebookPixel";
import { trackTikTokEvent } from "@/components/TikTokPixel";
import { sendFacebookEvent, FacebookEvent } from "@/lib/facebook";
import {
  generateEventID,
  prepareUserData,
  getFBCFromURL,
  getFBPFromCookie,
  getEventSourceURL,
} from "./facebook-helpers";

export interface PixelPurchaseParams {
  value: number;
  currency: string;
  orderId: string;
  packageType: "subscription" | "one-time" | "mini-draw" | "upsell";
  packageId?: string;
  packageName?: string;
  userId?: string;
  userEmail?: string;
  userPhone?: string;
  userFirstName?: string;
  userLastName?: string;
  userCity?: string;
  userState?: string;
  userZipCode?: string;
  userCountry?: string;
  entriesAdded?: number;
  pointsEarned?: number;
  subscriptionId?: string;
  paymentIntentId?: string;
  content_type?: string;
  content_ids?: string[];
  num_items?: number;
  eventSourceUrl?: string; // Optional URL override
}

/**
 * Track purchase event for Facebook and TikTok pixels
 * Now includes Conversions API integration with EventID deduplication
 */
export async function trackPixelPurchase(params: PixelPurchaseParams): Promise<void> {
  try {
    const {
      value,
      currency,
      orderId,
      packageType,
      packageId,
      packageName,
      userId,
      userEmail,
      userPhone,
      userFirstName,
      userLastName,
      userCity,
      userState,
      userZipCode,
      userCountry,
      entriesAdded,
      pointsEarned,
      subscriptionId,
      paymentIntentId,
      content_type,
      content_ids,
      num_items,
      eventSourceUrl,
    } = params;

    // Generate unique event ID for deduplication
    const eventID = generateEventID("purchase", orderId);
    const eventTime = Math.floor(Date.now() / 1000); // Unix timestamp

    // Prepare common parameters for browser pixel
    const commonParams = {
      eventID, // Include eventID for browser pixel deduplication
      value,
      currency,
      order_id: orderId, // Use order_id (not orderId) for Facebook
      content_type: content_type || getContentType(packageType),
      content_ids: content_ids || (packageId ? [packageId] : []),
      num_items: num_items || 1,
      // Custom parameters for Tools Australia
      package_type: packageType,
      package_id: packageId,
      package_name: packageName,
      entries_added: entriesAdded,
      points_earned: pointsEarned,
      subscription_id: subscriptionId,
      payment_intent_id: paymentIntentId,
      user_id: userId,
      user_email: userEmail,
      platform: "tools-australia",
    };

    // 1. Track Browser Pixel (client-side) - only if in browser context
    if (typeof window !== "undefined") {
      trackFacebookEvent("Purchase", commonParams);
      console.log(`📘 Facebook Pixel (Browser): Purchase tracked - $${value} ${currency}`);
    }

    // 2. Track Conversions API (server-side) - CRITICAL for accurate revenue tracking
    try {
      // Prepare user data with hashing
      const userData = prepareUserData({
        email: userEmail,
        phone: userPhone,
        firstName: userFirstName,
        lastName: userLastName,
        city: userCity,
        state: userState,
        zipCode: userZipCode,
        country: userCountry,
      });

      // Get fbc and fbp from browser (if available in server context, these would need to be passed)
      // For server-side, these should be passed from the client or extracted from request headers
      const fbc = typeof window !== "undefined" ? getFBCFromURL() : undefined;
      const fbp = typeof window !== "undefined" ? getFBPFromCookie() : undefined;

      // Add fbc and fbp to user data if available
      if (fbc) userData.fbc = fbc;
      if (fbp) userData.fbp = fbp;

      // Create Facebook Conversions API event
      const facebookEvent: FacebookEvent = {
        event_name: "Purchase",
        event_time: eventTime,
        event_id: eventID, // Critical for deduplication
        action_source: "website",
        user_data: Object.keys(userData).length > 0 ? (userData as FacebookEvent["user_data"]) : {},
        custom_data: {
          currency,
          value,
          order_id: orderId,
          content_type: content_type || getContentType(packageType),
          content_ids: content_ids || (packageId ? [packageId] : []),
          num_items: num_items || 1,
          content_name: packageName,
        },
        event_source_url: eventSourceUrl || (typeof window !== "undefined" ? getEventSourceURL() : undefined),
      };

      // Send to Conversions API
      const apiSuccess = await sendFacebookEvent(facebookEvent);
      if (apiSuccess) {
        console.log(`📘 Facebook Conversions API: Purchase tracked - $${value} ${currency} (EventID: ${eventID})`);
      } else {
        console.warn(`⚠️ Facebook Conversions API: Failed to send Purchase event (EventID: ${eventID})`);
      }
    } catch (apiError) {
      console.error("❌ Error sending to Facebook Conversions API:", apiError);
      // Don't throw - continue with browser pixel tracking
    }

    // 3. Track TikTok Pixel Purchase
    await trackTikTokEvent("CompletePayment", commonParams);
    console.log(`📱 TikTok Pixel: Purchase tracked for ${packageType} - $${value} ${currency}`);
  } catch (error) {
    console.error("❌ Error tracking pixel purchase:", error);
    // Don't throw - pixel tracking should not break purchase flow
  }
}

/**
 * Track subscription events (Subscribe/Unsubscribe)
 * Now includes Conversions API integration with EventID deduplication
 */
export async function trackPixelSubscription(
  action: "Subscribe" | "Unsubscribe",
  params: {
    value: number;
    currency: string;
    packageId: string;
    packageName: string;
    subscriptionId: string;
    userId?: string;
    userEmail?: string;
    userPhone?: string;
    userFirstName?: string;
    userLastName?: string;
    entriesPerMonth?: number;
    paymentIntentId?: string;
    eventSourceUrl?: string;
  }
): Promise<void> {
  try {
    const {
      value,
      currency,
      packageId,
      packageName,
      subscriptionId,
      userId,
      userEmail,
      userPhone,
      userFirstName,
      userLastName,
      entriesPerMonth,
      paymentIntentId,
      eventSourceUrl,
    } = params;

    // Generate unique event ID for deduplication
    const eventID = generateEventID(action.toLowerCase(), subscriptionId);
    const eventTime = Math.floor(Date.now() / 1000);

    const commonParams = {
      eventID, // Include eventID for browser pixel deduplication
      value,
      currency,
      content_type: "subscription",
      content_ids: [packageId],
      subscription_id: subscriptionId,
      package_id: packageId,
      package_name: packageName,
      entries_per_month: entriesPerMonth,
      payment_intent_id: paymentIntentId,
      user_id: userId,
      user_email: userEmail,
      platform: "tools-australia",
    };

    // 1. Track Browser Pixel (if in browser context)
    if (typeof window !== "undefined") {
      trackFacebookEvent(action, commonParams);
      console.log(`📘 Facebook Pixel (Browser): ${action} tracked - ${packageName} - $${value} ${currency}`);
    }

    // 2. Track Conversions API (server-side)
    try {
      const userData = prepareUserData({
        email: userEmail,
        phone: userPhone,
        firstName: userFirstName,
        lastName: userLastName,
      });

      const fbc = typeof window !== "undefined" ? getFBCFromURL() : undefined;
      const fbp = typeof window !== "undefined" ? getFBPFromCookie() : undefined;

      if (fbc) userData.fbc = fbc;
      if (fbp) userData.fbp = fbp;

      const facebookEvent: FacebookEvent = {
        event_name: action,
        event_time: eventTime,
        event_id: eventID,
        action_source: "website",
        user_data: Object.keys(userData).length > 0 ? (userData as FacebookEvent["user_data"]) : {},
        custom_data: {
          currency,
          value,
          content_type: "subscription",
          content_ids: [packageId],
          content_name: packageName,
        },
        event_source_url: eventSourceUrl || (typeof window !== "undefined" ? getEventSourceURL() : undefined),
      };

      const apiSuccess = await sendFacebookEvent(facebookEvent);
      if (apiSuccess) {
        console.log(
          `📘 Facebook Conversions API: ${action} tracked - ${packageName} - $${value} ${currency} (EventID: ${eventID})`
        );
      } else {
        console.warn(`⚠️ Facebook Conversions API: Failed to send ${action} event (EventID: ${eventID})`);
      }
    } catch (apiError) {
      console.error(`❌ Error sending ${action} to Facebook Conversions API:`, apiError);
    }

    // 3. Track TikTok Pixel
    await trackTikTokEvent(action, commonParams);
    console.log(`📱 TikTok Pixel: ${action} tracked - ${packageName} - $${value} ${currency}`);
  } catch (error) {
    console.error(`❌ Error tracking pixel ${action}:`, error);
  }
}

/**
 * Track subscription upgrade events (subscription change, not purchase)
 */
export async function trackPixelSubscriptionUpgrade(params: {
  oldValue: number;
  newValue: number;
  currency: string;
  oldPackageId: string;
  newPackageId: string;
  oldPackageName: string;
  newPackageName: string;
  subscriptionId: string;
  userId?: string;
  userEmail?: string;
  paymentIntentId?: string;
  prorationAmount?: number;
  entriesAdded?: number;
}): Promise<void> {
  try {
    const {
      oldValue,
      newValue,
      currency,
      oldPackageId,
      newPackageId,
      oldPackageName,
      newPackageName,
      subscriptionId,
      userId,
      userEmail,
      paymentIntentId,
      prorationAmount,
      entriesAdded,
    } = params;

    const commonParams = {
      value: Math.abs(newValue - oldValue), // Change amount
      currency,
      content_type: "subscription",
      content_ids: [newPackageId], // Focus on new package
      subscription_id: subscriptionId,
      old_package_id: oldPackageId,
      old_package_name: oldPackageName,
      old_value: oldValue,
      new_package_id: newPackageId,
      new_package_name: newPackageName,
      new_value: newValue,
      proration_amount: prorationAmount,
      entries_added: entriesAdded,
      payment_intent_id: paymentIntentId,
      user_id: userId,
      user_email: userEmail,
      platform: "tools-australia",
    };

    // Track Facebook Pixel - Use Subscribe event for upgrade
    await trackFacebookEvent("Subscribe", commonParams);
    console.log(`📘 Facebook Pixel: Subscription Upgrade tracked - ${oldPackageName} → ${newPackageName}`);

    // Track TikTok Pixel - Use Subscribe event for upgrade
    await trackTikTokEvent("Subscribe", commonParams);
    console.log(`📱 TikTok Pixel: Subscription Upgrade tracked - ${oldPackageName} → ${newPackageName}`);
  } catch (error) {
    console.error(`❌ Error tracking pixel subscription upgrade:`, error);
  }
}

/**
 * Track subscription downgrade events (subscription change, not purchase)
 */
export async function trackPixelSubscriptionDowngrade(params: {
  oldValue: number;
  newValue: number;
  currency: string;
  oldPackageId: string;
  newPackageId: string;
  oldPackageName: string;
  newPackageName: string;
  subscriptionId: string;
  userId?: string;
  userEmail?: string;
  paymentIntentId?: string;
  prorationAmount?: number;
  entriesRemoved?: number;
}): Promise<void> {
  try {
    const {
      oldValue,
      newValue,
      currency,
      oldPackageId,
      newPackageId,
      oldPackageName,
      newPackageName,
      subscriptionId,
      userId,
      userEmail,
      paymentIntentId,
      prorationAmount,
      entriesRemoved,
    } = params;

    const commonParams = {
      value: Math.abs(newValue - oldValue), // Change amount
      currency,
      content_type: "subscription",
      content_ids: [newPackageId], // Focus on new package
      subscription_id: subscriptionId,
      old_package_id: oldPackageId,
      old_package_name: oldPackageName,
      old_value: oldValue,
      new_package_id: newPackageId,
      new_package_name: newPackageName,
      new_value: newValue,
      proration_amount: prorationAmount,
      entries_removed: entriesRemoved,
      payment_intent_id: paymentIntentId,
      user_id: userId,
      user_email: userEmail,
      platform: "tools-australia",
    };

    // Track Facebook Pixel - Use Subscribe event for downgrade (still a subscription)
    await trackFacebookEvent("Subscribe", commonParams);
    console.log(`📘 Facebook Pixel: Subscription Downgrade tracked - ${oldPackageName} → ${newPackageName}`);

    // Track TikTok Pixel - Use Subscribe event for downgrade (still a subscription)
    await trackTikTokEvent("Subscribe", commonParams);
    console.log(`📱 TikTok Pixel: Subscription Downgrade tracked - ${oldPackageName} → ${newPackageName}`);
  } catch (error) {
    console.error(`❌ Error tracking pixel subscription downgrade:`, error);
  }
}

/**
 * Get content type based on package type
 */
function getContentType(packageType: string): string {
  switch (packageType) {
    case "subscription":
      return "subscription";
    case "one-time":
      return "membership_package";
    case "mini-draw":
      return "mini_draw_package";
    case "upsell":
      return "upsell_package";
    default:
      return "product";
  }
}

/**
 * Track cancellation events
 */
export async function trackPixelCancellation(params: {
  value: number;
  currency: string;
  packageId: string;
  packageName: string;
  subscriptionId: string;
  userId?: string;
  userEmail?: string;
  cancellationReason?: string;
}): Promise<void> {
  try {
    const { value, currency, packageId, packageName, subscriptionId, userId, userEmail, cancellationReason } = params;

    const commonParams = {
      value,
      currency,
      content_type: "subscription_cancellation",
      content_ids: [packageId],
      subscription_id: subscriptionId,
      package_id: packageId,
      package_name: packageName,
      cancellation_reason: cancellationReason,
      user_id: userId,
      user_email: userEmail,
      platform: "tools-australia",
    };

    // Track Facebook Pixel
    await trackFacebookEvent("Unsubscribe", commonParams);
    console.log(`📘 Facebook Pixel: Cancellation tracked - ${packageName}`);

    // Track TikTok Pixel
    await trackTikTokEvent("Unsubscribe", commonParams);
    console.log(`📱 TikTok Pixel: Cancellation tracked - ${packageName}`);
  } catch (error) {
    console.error("❌ Error tracking pixel cancellation:", error);
  }
}

/**
 * Track payment failed events
 * Helps identify and retarget users with failed payment attempts
 */
export async function trackPixelPaymentFailed(params: {
  value: number;
  currency: string;
  paymentIntentId: string;
  orderId?: string;
  packageId?: string;
  packageName?: string;
  packageType?: "subscription" | "one-time" | "mini-draw" | "upsell";
  userId?: string;
  userEmail?: string;
  userPhone?: string;
  userFirstName?: string;
  userLastName?: string;
  errorMessage?: string;
  errorCode?: string;
  failureReason?: string;
  eventSourceUrl?: string;
}): Promise<void> {
  try {
    const {
      value,
      currency,
      paymentIntentId,
      orderId,
      packageId,
      packageName,
      packageType,
      userId,
      userEmail,
      userPhone,
      userFirstName,
      userLastName,
      errorMessage,
      errorCode,
      failureReason,
      eventSourceUrl,
    } = params;

    // Generate unique event ID for deduplication
    const eventID = generateEventID("payment_failed", paymentIntentId);
    const eventTime = Math.floor(Date.now() / 1000);

    // Prepare common parameters for browser pixel
    const commonParams = {
      eventID,
      value,
      currency,
      payment_intent_id: paymentIntentId,
      ...(orderId && { order_id: orderId }),
      ...(packageId && { content_ids: [packageId] }),
      content_type: packageType ? getContentType(packageType) : "product",
      ...(packageName && { package_name: packageName }),
      ...(errorMessage && { error_message: errorMessage }),
      ...(errorCode && { error_code: errorCode }),
      ...(failureReason && { failure_reason: failureReason }),
      user_id: userId,
      user_email: userEmail,
      platform: "tools-australia",
    };

    // 1. Track Browser Pixel (if in browser context)
    if (typeof window !== "undefined") {
      trackFacebookEvent("PaymentFailed", commonParams);
      console.log(`📘 Facebook Pixel (Browser): Payment failed tracked - $${value} ${currency}`);
    }

    // 2. Track Conversions API (server-side)
    try {
      const userData = prepareUserData({
        email: userEmail,
        phone: userPhone,
        firstName: userFirstName,
        lastName: userLastName,
      });

      const fbc = typeof window !== "undefined" ? getFBCFromURL() : undefined;
      const fbp = typeof window !== "undefined" ? getFBPFromCookie() : undefined;

      if (fbc) userData.fbc = fbc;
      if (fbp) userData.fbp = fbp;

      const facebookEvent: FacebookEvent = {
        event_name: "PaymentFailed",
        event_time: eventTime,
        event_id: eventID,
        action_source: "website",
        user_data: Object.keys(userData).length > 0 ? (userData as FacebookEvent["user_data"]) : {},
        custom_data: {
          currency,
          value,
          ...(orderId && { order_id: orderId }),
          ...(packageId && { content_ids: [packageId] }),
          content_type: packageType ? getContentType(packageType) : "product",
          ...(packageName && { content_name: packageName }),
        },
        event_source_url: eventSourceUrl || (typeof window !== "undefined" ? getEventSourceURL() : undefined),
      };

      const apiSuccess = await sendFacebookEvent(facebookEvent);
      if (apiSuccess) {
        console.log(
          `📘 Facebook Conversions API: Payment failed tracked - $${value} ${currency} (EventID: ${eventID})`
        );
      } else {
        console.warn(`⚠️ Facebook Conversions API: Failed to send PaymentFailed event (EventID: ${eventID})`);
      }
    } catch (apiError) {
      console.error("❌ Error sending PaymentFailed to Facebook Conversions API:", apiError);
    }

    // 3. Track TikTok Pixel
    await trackTikTokEvent("PaymentFailed", commonParams);
    console.log(`📱 TikTok Pixel: Payment failed tracked - $${value} ${currency}`);
  } catch (error) {
    console.error("❌ Error tracking pixel payment failed:", error);
  }
}

/**
 * Track subscription renewal events
 * Tracks recurring revenue separately from initial purchases
 */
export async function trackPixelSubscriptionRenewal(params: {
  value: number;
  currency: string;
  subscriptionId: string;
  invoiceId: string;
  packageId: string;
  packageName: string;
  userId?: string;
  userEmail?: string;
  userPhone?: string;
  userFirstName?: string;
  userLastName?: string;
  entriesPerMonth?: number;
  eventSourceUrl?: string;
}): Promise<void> {
  try {
    const {
      value,
      currency,
      subscriptionId,
      invoiceId,
      packageId,
      packageName,
      userId,
      userEmail,
      userPhone,
      userFirstName,
      userLastName,
      entriesPerMonth,
      eventSourceUrl,
    } = params;

    // Generate unique event ID for deduplication
    const eventID = generateEventID("renewal", subscriptionId);
    const eventTime = Math.floor(Date.now() / 1000);

    // Prepare common parameters for browser pixel
    const commonParams = {
      eventID,
      value,
      currency,
      order_id: invoiceId, // Use invoice ID as order ID for renewals
      content_type: "subscription_renewal",
      content_ids: [packageId],
      subscription_id: subscriptionId,
      package_id: packageId,
      package_name: packageName,
      entries_per_month: entriesPerMonth,
      user_id: userId,
      user_email: userEmail,
      platform: "tools-australia",
    };

    // 1. Track Browser Pixel (if in browser context)
    if (typeof window !== "undefined") {
      trackFacebookEvent("Purchase", commonParams);
      console.log(`📘 Facebook Pixel (Browser): Subscription renewal tracked - $${value} ${currency}`);
    }

    // 2. Track Conversions API (server-side)
    try {
      const userData = prepareUserData({
        email: userEmail,
        phone: userPhone,
        firstName: userFirstName,
        lastName: userLastName,
      });

      const fbc = typeof window !== "undefined" ? getFBCFromURL() : undefined;
      const fbp = typeof window !== "undefined" ? getFBPFromCookie() : undefined;

      if (fbc) userData.fbc = fbc;
      if (fbp) userData.fbp = fbp;

      const facebookEvent: FacebookEvent = {
        event_name: "Purchase",
        event_time: eventTime,
        event_id: eventID,
        action_source: "website",
        user_data: Object.keys(userData).length > 0 ? (userData as FacebookEvent["user_data"]) : {},
        custom_data: {
          currency,
          value,
          order_id: invoiceId,
          content_type: "subscription_renewal",
          content_ids: [packageId],
          content_name: packageName,
        },
        event_source_url: eventSourceUrl || (typeof window !== "undefined" ? getEventSourceURL() : undefined),
      };

      const apiSuccess = await sendFacebookEvent(facebookEvent);
      if (apiSuccess) {
        console.log(
          `📘 Facebook Conversions API: Subscription renewal tracked - $${value} ${currency} (EventID: ${eventID})`
        );
      } else {
        console.warn(`⚠️ Facebook Conversions API: Failed to send renewal event (EventID: ${eventID})`);
      }
    } catch (apiError) {
      console.error("❌ Error sending renewal to Facebook Conversions API:", apiError);
    }

    // 3. Track TikTok Pixel
    await trackTikTokEvent("CompletePayment", commonParams);
    console.log(`📱 TikTok Pixel: Subscription renewal tracked - $${value} ${currency}`);
  } catch (error) {
    console.error("❌ Error tracking pixel subscription renewal:", error);
  }
}
