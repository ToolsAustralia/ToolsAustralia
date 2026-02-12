/**
 * Pixel Purchase Tracking Utilities
 *
 * Provides server-side pixel tracking for all purchase events via Conversions API only.
 * This ensures pixel events are fired for every purchase type.
 * Uses Conversions API (CAPI) for accurate revenue tracking - browser pixel removed.
 *
 * @version 2.1.0
 */

import { trackFacebookEvent } from "@/components/FacebookPixel";
import { trackTikTokEvent } from "@/components/TikTokPixel";
import { trackKlaviyoEvent } from "@/utils/tracking/klaviyo-helpers";
import {
  sendFacebookEvent,
  FacebookEvent,
  buildFacebookPurchaseEventDev,
  sendFacebookPurchaseEventDev,
  getFacebookTestEventCode,
} from "@/lib/facebook";
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
  packageType: "membership" | "one-time" | "mini-draw" | "upsell";
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
    event_source_url?: string;
  };
  // Alternative: Direct parameters (for flexibility)
  clientIpAddress?: string;
  clientUserAgent?: string;
  // A/B Testing fields (optional)
  experimentId?: string;
  variantId?: string;
  anonymousId?: string; // Anonymous ID for A/B testing tracking (for users who visited before logging in)
}

/** Server-side fallback for event_source_url when not in request context (Meta requires it for website events). */
function getServerEventSourceUrlFallback(): string | undefined {
  const base =
    typeof process !== "undefined"
      ? process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
      : undefined;
  if (!base) return undefined;
  const url = base.startsWith("http") ? base : `https://${base}`;
  return `${url.replace(/\/$/, "")}/shop`;
}

/**
 * Track purchase event via Conversions API (CAPI-only)
 * Browser pixel removed - using server-side CAPI for accurate revenue tracking
 * Includes EventID deduplication for reliable conversion tracking
 * @returns true if the event was successfully sent to CAPI, false otherwise
 */
export async function trackPixelPurchase(params: PixelPurchaseParams): Promise<boolean> {
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
      experimentId,
      variantId,
      anonymousId,
    } = params;

    // Use orderId as event_id for Purchase (deterministic; enables Pixel+CAPI deduplication if Pixel is added later)
    const eventID = orderId;

    // Track Conversions API (server-side) - CRITICAL for accurate revenue tracking
    // Browser pixel removed - using CAPI-only approach per documentation
    let capiSuccess = false;

    // Prepare common parameters for TikTok/Klaviyo tracking (client-side only)
    const commonParams = {
      eventID, // Include eventID for TikTok tracking
      value,
      currency,
      order_id: orderId, // Use order_id (not orderId) for TikTok
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
      // A/B Testing metadata (if provided)
      ...(experimentId && { experiment_id: experimentId }),
      ...(variantId && { variant_id: variantId }),
    };
    
    try {
      // Prepare user data with hashing (include externalId for Meta matching)
      // Country defaults to "AU" for Tools Australia when not provided
      const userData = prepareUserData({
        email: userEmail,
        phone: userPhone,
        firstName: userFirstName,
        lastName: userLastName,
        state: userState,
        country: userCountry || "AU",
        ...(userId && { externalId: userId }),
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
      let userAgent = requestContext?.client_user_agent || clientUserAgent;

      // Meta requires client_user_agent for website events. When sending from server (e.g. webhook)
      // without request context, use a placeholder so the event is accepted (match quality may be lower).
      if (!userAgent && typeof window === "undefined") {
        userAgent = "Mozilla/5.0 (compatible; Server-Side-CAPI/1.0)";
      }

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

      // Meta requires event_source_url for action_source "website"
      // buildFacebookPurchaseEventDev uses fallback (https://example.com/dev-checkout) when localhost
      const resolvedEventSourceUrl =
        requestContext?.event_source_url ??
        eventSourceUrl ??
        (typeof window !== "undefined" ? getEventSourceURL() : undefined) ??
        getServerEventSourceUrlFallback();

      // Build validated Purchase event (handles localhost fallback, value/currency validation)
      const facebookEvent = buildFacebookPurchaseEventDev({
        value,
        currency,
        eventId: eventID,
        userData: {
          ...(userData as Record<string, string>),
          client_ip_address: clientIp,
          client_user_agent: userAgent || "Mozilla/5.0 (compatible; Server-Side-CAPI/1.0)",
          ...(fbc && { fbc }),
          ...(fbp && { fbp }),
        },
        eventSourceUrl: resolvedEventSourceUrl ?? undefined,
        customData: {
          value,
          currency,
          order_id: orderId,
          content_ids: content_ids || (packageId ? [packageId] : []),
          content_type: content_type || getContentType(packageType),
          num_items: num_items ?? 1,
        },
      });

      if (facebookEvent) {
        // Uses test_event_code in dev, never throws
        capiSuccess = await sendFacebookPurchaseEventDev(facebookEvent);
      } else {
        if (typeof process !== "undefined" && process.env.NODE_ENV !== "test") {
          console.warn(
            `⚠️ [Facebook CAPI] Skipping Purchase event: validation failed (value/currency). OrderId: ${orderId}, value: ${value}, currency: ${currency}`
          );
        }
      }
    } catch (apiError) {
      if (typeof process !== "undefined" && process.env.NODE_ENV !== "test") {
        console.error("❌ [Facebook CAPI] Error sending Purchase event:", apiError);
      }
    }

    // ✅ Track purchase as experiment event (for A/B testing analytics)
    // This ensures purchases are counted in conversion rates and analytics
    // ✅ DEDUPLICATION: Uses orderId to prevent duplicate tracking
    if (experimentId && variantId) {
      try {
        // Track both "purchase" and "conversion" events
        // Purchase = specific purchase event
        // Conversion = any conversion (includes purchases)
        // ✅ Both events use the same orderId for deduplication
        if (typeof window !== "undefined") {
          // Client-side: Use fetch API
          // Use Promise.allSettled to ensure both events are attempted even if one fails
          const results = await Promise.allSettled([
            fetch("/api/ab-testing/track", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                experimentId,
                variantId,
                eventType: "purchase",
                metadata: {
                  orderId, // ✅ Critical for deduplication
                  value,
                  currency,
                  packageType,
                  packageId,
                  packageName,
                },
              }),
            }),
            fetch("/api/ab-testing/track", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                experimentId,
                variantId,
                eventType: "conversion",
                metadata: {
                  orderId, // ✅ Critical for deduplication
                  value,
                  currency,
                  packageType,
                  source: "purchase",
                },
              }),
            }),
          ]);

          // Log any failures (but don't throw - tracking should not block purchase flow)
          results.forEach((result, index) => {
            if (result.status === "rejected") {
              console.error(`Error tracking ${index === 0 ? "purchase" : "conversion"} event:`, result.reason);
            } else if (!result.value.ok) {
              const eventType = index === 0 ? "purchase" : "conversion";
              // Check if it's a duplicate (which is OK)
              result.value.json().then((data: { duplicate?: boolean }) => {
                if (!data.duplicate) {
                  console.warn(`Failed to track ${eventType} event:`, result.value.status);
                }
              }).catch(() => {
                // Ignore JSON parse errors
              });
            }
          });
        } else {
          // Server-side: Call repository directly (for webhook/server-side purchases)
          const { default: ExperimentEventRepository } = await import("@/repositories/ab-testing/ExperimentEventRepository");
          const { default: connectDB } = await import("@/lib/mongodb");
          
          await connectDB();
          
          console.log(`📊 [A/B Testing] Tracking server-side purchase/conversion:`, {
            experimentId,
            variantId,
            orderId,
            userId: userId || "anonymous",
            anonymousId: anonymousId || "none",
            value,
            currency,
          });
          
          // Track purchase event
          await ExperimentEventRepository.createEvent({
            experimentId,
            variantId,
            eventType: "purchase",
            userId: userId || undefined,
            anonymousId: anonymousId || undefined, // ✅ ADD: Pass anonymousId if available
            metadata: {
              orderId, // ✅ Critical for deduplication
              value,
              currency,
              packageType,
              packageId,
              packageName,
            },
          });
          
          // Track conversion event
          await ExperimentEventRepository.createEvent({
            experimentId,
            variantId,
            eventType: "conversion",
            userId: userId || undefined,
            anonymousId: anonymousId || undefined, // ✅ ADD: Pass anonymousId if available
            metadata: {
              orderId, // ✅ Critical for deduplication
              value,
              currency,
              packageType,
              source: "purchase",
            },
          });
          
          console.log(`✅ [A/B Testing] Server-side purchase/conversion tracked successfully for experiment ${experimentId}, variant ${variantId}, order ${orderId}`);
        }
      } catch (error) {
        // Silently fail - experiment tracking should not block purchase flow
        console.error("Error tracking experiment events for purchase:", error);
      }
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

    return capiSuccess;
  } catch (error) {
    console.error("❌ Error tracking pixel purchase:", error);
    // Don't throw - pixel tracking should not break purchase flow
    return false;
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
      event_source_url?: string;
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
        event_source_url:
          requestContext?.event_source_url ??
          eventSourceUrl ??
          (typeof window !== "undefined" ? getEventSourceURL() : undefined),
      };

      const testEventCode = getFacebookTestEventCode();
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
 * Track subscription renewal events
 * NOTE: Renewals are NOT sent to Facebook as Purchase events per best practices.
 * Only tracks to TikTok/Klaviyo for internal analytics.
 * Facebook should only receive new purchase events, not renewals.
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

    // Prepare common parameters for TikTok/Klaviyo tracking
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

    // ✅ CRITICAL: Renewals are NOT sent to Facebook as Purchase events per best practices
    // Facebook should only receive new purchase events, not subscription renewals
    // This ensures accurate conversion tracking and prevents inflated revenue metrics

    // Track TikTok Pixel (optional - for internal analytics)
    await trackTikTokEvent("CompletePayment", commonParams);
    // console.log(`📱 TikTok Pixel: Subscription renewal tracked - $${value} ${currency}`);
  } catch (error) {
    // console.error("❌ Error tracking pixel subscription renewal:", error);
  }
}
