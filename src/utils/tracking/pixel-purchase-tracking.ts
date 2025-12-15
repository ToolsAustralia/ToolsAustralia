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
import { trackKlaviyoEvent } from "@/utils/tracking/klaviyo-helpers";
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
  fbc?: string; // Facebook Click ID (for server-side tracking)
  fbp?: string; // Facebook Browser ID (for server-side tracking)
  // NEW: Optional request context for improved match quality (backward compatible)
  requestContext?: {
    client_ip_address?: string;
    client_user_agent?: string;
    fbc?: string;
    fbp?: string;
  };
  // Alternative: Direct parameters (for flexibility)
  clientIpAddress?: string;
  clientUserAgent?: string;
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
      fbc: providedFbc,
      fbp: providedFbp,
      requestContext,
      clientIpAddress,
      clientUserAgent,
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
      // console.log(`📘 Facebook Pixel (Browser): Purchase tracked - $${value} ${currency}`);
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

      // Get fbc and fbp - prioritize requestContext, then provided values, then try to extract
      // For server-side tracking, these should be passed as parameters or extracted from request
      let fbc = requestContext?.fbc || providedFbc;
      let fbp = requestContext?.fbp || providedFbp;

      // If not provided, try to extract from browser (client-side) or request (server-side)
      if (!fbc) {
        if (typeof window !== "undefined") {
          fbc = getFBCFromURL();
        }
        // Note: For server-side, fbc should be passed as parameter or extracted from request
        // using extractFBCFromRequest() helper
      }

      if (!fbp) {
        if (typeof window !== "undefined") {
          fbp = getFBPFromCookie();
        }
        // Note: For server-side, fbp should be passed as parameter or extracted from request
        // using extractFBPFromRequest() helper
      }

      // Extract IP address and user agent - CRITICAL for Event Match Quality
      // Prioritize requestContext, then direct parameters
      const clientIp = requestContext?.client_ip_address || clientIpAddress;
      const userAgent = requestContext?.client_user_agent || clientUserAgent;

      // Add IP address and user agent to user data (required by Meta for optimal match quality)
      if (clientIp) {
        userData.client_ip_address = clientIp;
      }
      if (userAgent) {
        userData.client_user_agent = userAgent;
      }

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

      // Get test event code if in development
      const testEventCode = process.env.NODE_ENV === "development" ? process.env.FACEBOOK_TEST_EVENT_CODE : undefined;

      // Send to Conversions API
      const apiSuccess = await sendFacebookEvent(facebookEvent, testEventCode);
      if (apiSuccess) {
        // console.log(`📘 Facebook Conversions API: Purchase tracked - $${value} ${currency} (EventID: ${eventID})`);
      } else {
        // console.warn(`⚠️ Facebook Conversions API: Failed to send Purchase event (EventID: ${eventID})`);
      }
    } catch (apiError) {
      // console.error("❌ Error sending to Facebook Conversions API:", apiError);
      // Don't throw - continue with browser pixel tracking
    }

    // 3. Track TikTok Pixel Purchase (client-side only)
    // ✅ FIX: Skip TikTok tracking on server-side - it's a client component function
    if (typeof window !== "undefined") {
      try {
        await trackTikTokEvent("CompletePayment", commonParams);
        // console.log(`📱 TikTok Pixel: Purchase tracked for ${packageType} - $${value} ${currency}`);
      } catch (tiktokError) {
        // Silently fail - TikTok tracking is optional and client-side only
        console.warn("⚠️ TikTok Pixel tracking skipped (server-side execution)");
      }
    }

    // 4. Track Klaviyo Purchase (client-side only)
    if (typeof window !== "undefined") {
      try {
        trackKlaviyoEvent("Placed Order", {
          value,
          currency,
          order_id: orderId,
          item_count: num_items || 1,
          items: packageId
            ? [
                {
                  product_id: packageId,
                  product_name: packageName,
                  value,
                  quantity: num_items || 1,
                },
              ]
            : [],
          package_type: packageType,
          package_id: packageId,
          package_name: packageName,
          user_id: userId,
          user_email: userEmail,
        });
        // console.log(`📧 Klaviyo: Purchase tracked for ${packageType} - $${value} ${currency}`);
      } catch (klaviyoError) {
        // Silently fail - Klaviyo tracking is optional and client-side only
        if (process.env.NODE_ENV === "development") {
          console.warn("⚠️ Klaviyo tracking error:", klaviyoError);
        }
      }
    }
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
    // NEW: Optional request context for improved match quality (backward compatible)
    requestContext?: {
      client_ip_address?: string;
      client_user_agent?: string;
      fbc?: string;
      fbp?: string;
    };
    clientIpAddress?: string;
    clientUserAgent?: string;
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
      requestContext,
      clientIpAddress,
      clientUserAgent,
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
      // console.log(`📘 Facebook Pixel (Browser): ${action} tracked - ${packageName} - $${value} ${currency}`);
    }

    // 2. Track Conversions API (server-side)
    try {
      const userData = prepareUserData({
        email: userEmail,
        phone: userPhone,
        firstName: userFirstName,
        lastName: userLastName,
      });

      // Get fbc and fbp - prioritize requestContext, then try to extract
      let fbc = requestContext?.fbc;
      let fbp = requestContext?.fbp;

      if (typeof window !== "undefined") {
        if (!fbc) fbc = getFBCFromURL();
        if (!fbp) fbp = getFBPFromCookie();
      }

      // Extract IP address and user agent - CRITICAL for Event Match Quality
      const clientIp = requestContext?.client_ip_address || clientIpAddress;
      const userAgent = requestContext?.client_user_agent || clientUserAgent;

      // Add IP address and user agent to user data (required by Meta for optimal match quality)
      if (clientIp) {
        userData.client_ip_address = clientIp;
      }
      if (userAgent) {
        userData.client_user_agent = userAgent;
      }

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

      // Get test event code if in development
      const testEventCode = process.env.NODE_ENV === "development" ? process.env.FACEBOOK_TEST_EVENT_CODE : undefined;

      const apiSuccess = await sendFacebookEvent(facebookEvent, testEventCode);
      if (apiSuccess) {
        // console.log(
        //   `📘 Facebook Conversions API: ${action} tracked - ${packageName} - $${value} ${currency} (EventID: ${eventID})`
        // );
      } else {
        // console.warn(`⚠️ Facebook Conversions API: Failed to send ${action} event (EventID: ${eventID})`);
      }
    } catch (apiError) {
      // console.error(`❌ Error sending ${action} to Facebook Conversions API:`, apiError);
    }

    // 3. Track TikTok Pixel
    await trackTikTokEvent(action, commonParams);
    // console.log(`📱 TikTok Pixel: ${action} tracked - ${packageName} - $${value} ${currency}`);
  } catch (error) {
    // console.error(`❌ Error tracking pixel ${action}:`, error);
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
    // console.log(`📘 Facebook Pixel: Subscription Upgrade tracked - ${oldPackageName} → ${newPackageName}`);

    // Track TikTok Pixel - Use Subscribe event for upgrade
    await trackTikTokEvent("Subscribe", commonParams);
    // console.log(`📱 TikTok Pixel: Subscription Upgrade tracked - ${oldPackageName} → ${newPackageName}`);
  } catch (error) {
    // console.error(`❌ Error tracking pixel subscription upgrade:`, error);
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
    // console.log(`📘 Facebook Pixel: Subscription Downgrade tracked - ${oldPackageName} → ${newPackageName}`);

    // Track TikTok Pixel - Use Subscribe event for downgrade (still a subscription)
    await trackTikTokEvent("Subscribe", commonParams);
    // console.log(`📱 TikTok Pixel: Subscription Downgrade tracked - ${oldPackageName} → ${newPackageName}`);
  } catch (error) {
    // console.error(`❌ Error tracking pixel subscription downgrade:`, error);
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
    // console.log(`📘 Facebook Pixel: Cancellation tracked - ${packageName}`);

    // Track TikTok Pixel
    await trackTikTokEvent("Unsubscribe", commonParams);
    // console.log(`📱 TikTok Pixel: Cancellation tracked - ${packageName}`);
  } catch (error) {
    // console.error("❌ Error tracking pixel cancellation:", error);
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
  fbc?: string; // Facebook Click ID (for server-side tracking)
  fbp?: string; // Facebook Browser ID (for server-side tracking)
  // NEW: Optional request context for improved match quality (backward compatible)
  requestContext?: {
    client_ip_address?: string;
    client_user_agent?: string;
    fbc?: string;
    fbp?: string;
  };
  clientIpAddress?: string;
  clientUserAgent?: string;
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
      fbc: providedFbc,
      fbp: providedFbp,
      requestContext,
      clientIpAddress,
      clientUserAgent,
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
      // console.log(`📘 Facebook Pixel (Browser): Payment failed tracked - $${value} ${currency}`);
    }

    // 2. Track Conversions API (server-side)
    try {
      const userData = prepareUserData({
        email: userEmail,
        phone: userPhone,
        firstName: userFirstName,
        lastName: userLastName,
      });

      // Get fbc and fbp - prioritize requestContext, then provided values, then try to extract
      let fbc = requestContext?.fbc || providedFbc;
      let fbp = requestContext?.fbp || providedFbp;

      if (typeof window !== "undefined") {
        if (!fbc) fbc = getFBCFromURL();
        if (!fbp) fbp = getFBPFromCookie();
      }

      // Extract IP address and user agent - CRITICAL for Event Match Quality
      const clientIp = requestContext?.client_ip_address || clientIpAddress;
      const userAgent = requestContext?.client_user_agent || clientUserAgent;

      // Add IP address and user agent to user data (required by Meta for optimal match quality)
      if (clientIp) {
        userData.client_ip_address = clientIp;
      }
      if (userAgent) {
        userData.client_user_agent = userAgent;
      }

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

      // Get test event code if in development
      const testEventCode = process.env.NODE_ENV === "development" ? process.env.FACEBOOK_TEST_EVENT_CODE : undefined;

      const apiSuccess = await sendFacebookEvent(facebookEvent, testEventCode);
      if (apiSuccess) {
        // console.log(
        //   `📘 Facebook Conversions API: Payment failed tracked - $${value} ${currency} (EventID: ${eventID})`
        // );
      } else {
        // console.warn(`⚠️ Facebook Conversions API: Failed to send PaymentFailed event (EventID: ${eventID})`);
      }
    } catch (apiError) {
      // console.error("❌ Error sending PaymentFailed to Facebook Conversions API:", apiError);
    }

    // 3. Track TikTok Pixel
    await trackTikTokEvent("PaymentFailed", commonParams);
    // console.log(`📱 TikTok Pixel: Payment failed tracked - $${value} ${currency}`);
  } catch (error) {
    // console.error("❌ Error tracking pixel payment failed:", error);
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
  fbc?: string; // Facebook Click ID (for server-side tracking)
  fbp?: string; // Facebook Browser ID (for server-side tracking)
  // NEW: Optional request context for improved match quality (backward compatible)
  requestContext?: {
    client_ip_address?: string;
    client_user_agent?: string;
    fbc?: string;
    fbp?: string;
  };
  clientIpAddress?: string;
  clientUserAgent?: string;
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
      fbc: providedFbc,
      fbp: providedFbp,
      requestContext,
      clientIpAddress,
      clientUserAgent,
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
      // console.log(`📘 Facebook Pixel (Browser): Subscription renewal tracked - $${value} ${currency}`);
    }

    // 2. Track Conversions API (server-side)
    try {
      const userData = prepareUserData({
        email: userEmail,
        phone: userPhone,
        firstName: userFirstName,
        lastName: userLastName,
      });

      // Get fbc and fbp - prioritize requestContext, then provided values, then try to extract
      let fbc = requestContext?.fbc || providedFbc;
      let fbp = requestContext?.fbp || providedFbp;

      if (!fbc && typeof window !== "undefined") {
        fbc = getFBCFromURL();
      }

      if (!fbp && typeof window !== "undefined") {
        fbp = getFBPFromCookie();
      }

      // Extract IP address and user agent - CRITICAL for Event Match Quality
      const clientIp = requestContext?.client_ip_address || clientIpAddress;
      const userAgent = requestContext?.client_user_agent || clientUserAgent;

      // Add IP address and user agent to user data (required by Meta for optimal match quality)
      if (clientIp) {
        userData.client_ip_address = clientIp;
      }
      if (userAgent) {
        userData.client_user_agent = userAgent;
      }

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

      // Get test event code if in development
      const testEventCode = process.env.NODE_ENV === "development" ? process.env.FACEBOOK_TEST_EVENT_CODE : undefined;

      const apiSuccess = await sendFacebookEvent(facebookEvent, testEventCode);
      if (apiSuccess) {
        // console.log(
        //   `📘 Facebook Conversions API: Subscription renewal tracked - $${value} ${currency} (EventID: ${eventID})`
        // );
      } else {
        // console.warn(`⚠️ Facebook Conversions API: Failed to send renewal event (EventID: ${eventID})`);
      }
    } catch (apiError) {
      // console.error("❌ Error sending renewal to Facebook Conversions API:", apiError);
    }

    // 3. Track TikTok Pixel
    await trackTikTokEvent("CompletePayment", commonParams);
    // console.log(`📱 TikTok Pixel: Subscription renewal tracked - $${value} ${currency}`);
  } catch (error) {
    // console.error("❌ Error tracking pixel subscription renewal:", error);
  }
}
