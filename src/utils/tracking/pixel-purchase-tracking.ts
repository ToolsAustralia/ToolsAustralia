/**
 * Pixel Purchase Tracking Utilities
 *
 * Provider-agnostic Purchase / Subscribe / Unsubscribe / Renewal tracking.
 *
 * Each function builds a CanonicalEvent once and dispatches via:
 * - `sendConversion(...)`     — server side (CAPI fan-out to FB + TikTok + Snap)
 * - browser-side Purchase pixel fires from the success-page clients themselves
 *   (see PurchaseSuccessClient etc.) — this file is server-side only for purchases.
 *
 * Klaviyo events stay as a direct call (Klaviyo is marketing automation, not a CAPI provider).
 */

import { trackFacebookEvent, trackTikTokEvent } from "./legacy-pixel-helpers";
import {
  sendFacebookEvent,
  FacebookEvent,
  getFacebookTestEventCode,
} from "@/lib/facebook";
import {
  generateEventID,
  prepareUserData,
  getFBCFromURL,
  getFBPFromCookie,
  getEventSourceURL,
} from "./facebook-helpers";
import { sendConversion } from "@/lib/tracking/dispatch";
import { buildPurchaseEvent } from "@/lib/tracking/canonical-event";
import { tiktokProvider } from "@/lib/tracking/providers/tiktok";
import type { CanonicalEvent } from "@/lib/tracking/types";

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
  userBirthdate?: string | Date;
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
    /**
     * TikTok click id / first-party browser id, carried through Stripe metadata
     * (`capi_ttclid` / `capi_ttp`) by the payment-creation routes. Purchase fires from the
     * Stripe webhook, which has no browser cookies — without this hand-off the server
     * Purchase reaches TikTok with no click id at all (the Meta side already did this
     * with fbc/fbp; TikTok was simply never wired to the same channel).
     */
    ttclid?: string;
    ttp?: string;
    event_source_url?: string;
  };
  // Alternative: Direct parameters (for flexibility)
  clientIpAddress?: string;
  clientUserAgent?: string;
  // A/B Testing fields (optional)
  experimentId?: string;
  variantId?: string;
  anonymousId?: string; // Anonymous ID for A/B testing tracking (for users who visited before logging in)
  /** When true, sets CAPI custom_data.content_category to "resubscribe" for segmentation. */
  isResubscribe?: boolean;
  /**
   * "website" (default) for browser-initiated checkouts. "system_generated" for
   * Stripe webhook-initiated payments — no live browser session, no real
   * event_source_url. Meta accepts this and treats it as backend-attributed.
   */
  actionSource?: "website" | "system_generated";
  /**
   * Unix SECONDS the charge actually happened (Stripe PI `created` / invoice
   * `paid_at`). Without it the CAPI event_time is the webhook send moment, which
   * books purchases paid just before midnight into the next day's Meta reporting.
   * Out-of-window values fall back to "now" — see resolveEventTime.
   */
  eventTimeUnixSeconds?: number;
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
 * Fire a server-side TikTok Events API custom event (e.g. MembershipUpgrade / Downgrade).
 * The legacy browser `trackTikTokEvent` helper no-ops in a server route (`window` undefined),
 * so these subscription-change conversions never reached TikTok — Meta received them, TikTok
 * did not. This sends the real Events API event via tiktokProvider.capiSend, with the SAME
 * event_id as the Meta custom event. No-ops cleanly when TikTok CAPI creds are unset.
 */
async function sendTikTokServerCustomEvent(params: {
  eventName: string;
  eventId: string;
  value: number;
  currency: string;
  packageId: string;
  packageName?: string;
  packageType: string;
  orderId?: string;
  user: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    state?: string;
    birthdate?: string | Date;
    zipCode?: string;
    externalId?: string;
  };
  requestContext?: {
    client_ip_address?: string;
    client_user_agent?: string;
    event_source_url?: string;
  };
}): Promise<void> {
  try {
    const { requestContext } = params;
    const eventSourceUrl = requestContext?.event_source_url ?? getServerEventSourceUrlFallback();
    const canonical: CanonicalEvent = {
      eventName: params.eventName,
      eventId: params.eventId,
      eventTime: Math.floor(Date.now() / 1000),
      value: params.value,
      currency: params.currency,
      userData: {
        email: params.user.email,
        phone: params.user.phone,
        firstName: params.user.firstName,
        lastName: params.user.lastName,
        state: params.user.state,
        birthdate: params.user.birthdate,
        zipCode: params.user.zipCode,
        country: "AU",
        ...(params.user.externalId && { externalId: params.user.externalId }),
        ...(requestContext?.client_ip_address && { clientIpAddress: requestContext.client_ip_address }),
        ...(requestContext?.client_user_agent && { clientUserAgent: requestContext.client_user_agent }),
      },
      customData: {
        contentIds: [params.packageId],
        ...(params.packageName && { contentName: params.packageName }),
        contentType: "product",
        packageType: params.packageType,
        ...(params.orderId && { orderId: params.orderId }),
      },
      ...(eventSourceUrl && { eventSourceUrl }),
      actionSource: "website",
    };
    await tiktokProvider.capiSend(canonical, {
      clientIpAddress: requestContext?.client_ip_address,
      clientUserAgent: requestContext?.client_user_agent,
      ...(eventSourceUrl && { eventSourceUrl }),
    });
  } catch {
    // never throw from tracking
  }
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
      userState,
      userCountry,
      userBirthdate,
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
      isResubscribe,
      paymentIntentId,
      subscriptionId,
      entriesAdded,
      pointsEarned,
      actionSource,
      eventTimeUnixSeconds,
    } = params;

    if (!orderId?.trim()) {
      console.error("Conversion Purchase skipped: missing orderId (eventId)");
      return false;
    }

    const eventId = orderId.trim();

    // Resolve fbc/fbp the legacy way — requestContext, then provided, then client-side cookies.
    let fbc = requestContext?.fbc ?? providedFbc;
    let fbp = requestContext?.fbp ?? providedFbp;
    if (!fbc && typeof window !== "undefined") fbc = getFBCFromURL();
    if (!fbp && typeof window !== "undefined") fbp = getFBPFromCookie();

    const resolvedClientIp = requestContext?.client_ip_address ?? clientIpAddress;
    const resolvedUserAgent = requestContext?.client_user_agent ?? clientUserAgent;

    const event = buildPurchaseEvent({
      value,
      currency,
      eventId,
      // Webhook-initiated payments should pass `actionSource: "system_generated"`
      // so Meta's spec is honored (no live browser session, no real event_source_url).
      actionSource,
      // Charge time, not send time — keeps the conversion in the day the money moved.
      eventTimeUnixSeconds,
      userData: {
        email: userEmail,
        phone: userPhone,
        firstName: userFirstName,
        lastName: userLastName,
        state: userState,
        country: userCountry ?? "AU",
        externalId: userId,
        birthdate: userBirthdate,
        clientIpAddress: resolvedClientIp,
        clientUserAgent: resolvedUserAgent,
        fbc,
        fbp,
        // Read by the TikTok provider only (same way fbc/fbp are FB-only).
        ttclid: requestContext?.ttclid,
        ttp: requestContext?.ttp,
      },
      customData: {
        orderId,
        contentType: content_type ?? "product",
        contentIds: content_ids ?? (packageId ? [packageId] : undefined),
        ...(packageName && { contentName: packageName }),
        ...(isResubscribe && { contentCategory: "resubscribe" }),
        numItems: num_items ?? 1,
        packageType,
      },
      // For system_generated events, the facebookProvider intentionally drops
      // event_source_url (Meta spec: only meaningful for "website" events). Skip
      // building the synthetic fallback so we don't fabricate a misleading URL.
      eventSourceUrl:
        actionSource === "system_generated"
          ? requestContext?.event_source_url ?? eventSourceUrl
          : requestContext?.event_source_url ??
            eventSourceUrl ??
            (typeof window !== "undefined" ? getEventSourceURL() : undefined) ??
            getServerEventSourceUrlFallback(),
    });

    const results = await sendConversion(event, {
      clientIpAddress: event.userData?.clientIpAddress,
      clientUserAgent: event.userData?.clientUserAgent,
      eventSourceUrl: event.eventSourceUrl,
    });

    // ✅ A/B experiment tracking — preserved legacy client/server branching.
    // Client-side bundles can't import @/lib/mongodb or repositories, so the browser path
    // posts to /api/ab-testing/track instead.
    if (experimentId && variantId) {
      try {
        if (typeof window !== "undefined") {
          // Client-side: Use fetch API
          const abResults = await Promise.allSettled([
            fetch("/api/ab-testing/track", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                experimentId,
                variantId,
                eventType: "purchase",
                metadata: {
                  orderId,
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
                  orderId,
                  value,
                  currency,
                  packageType,
                  source: "purchase",
                },
              }),
            }),
          ]);

          abResults.forEach((result, index) => {
            if (result.status === "rejected") {
              console.error(`Error tracking ${index === 0 ? "purchase" : "conversion"} event:`, result.reason);
            } else if (!result.value.ok) {
              const eventType = index === 0 ? "purchase" : "conversion";
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

          await ExperimentEventRepository.createEvent({
            experimentId,
            variantId,
            eventType: "purchase",
            userId: userId || undefined,
            anonymousId: anonymousId || undefined,
            metadata: { orderId, value, currency, packageType, packageId, packageName },
          });
          await ExperimentEventRepository.createEvent({
            experimentId,
            variantId,
            eventType: "conversion",
            userId: userId || undefined,
            anonymousId: anonymousId || undefined,
            metadata: { orderId, value, currency, packageType, source: "purchase" },
          });
        }
      } catch (err) {
        console.error("A/B experiment tracking failed (non-fatal):", err);
      }
    }

    // Klaviyo "Placed Order" is fired authoritatively from the Stripe webhook via
    // `trackPlacedOrder` in `src/utils/integrations/klaviyo/klaviyo-revenue-service.ts`
    // — which uses the strict revenue schema ($value / Currency / Order ID) and a
    // deterministic Order ID for refund linking. The previous browser-side fire here
    // used the WRONG field names ("value", "order_id") which Klaviyo ignores for
    // revenue, and would double-fire if any client caller of trackPixelPurchase is
    // ever added. Removed deliberately.

    // Reference unused params to satisfy noUnusedLocals (renewal-specific fields kept on PixelPurchaseParams type).
    void paymentIntentId;
    void subscriptionId;
    void entriesAdded;
    void pointsEarned;

    return Object.values(results).some(Boolean);
  } catch (error) {
    console.error("Error tracking pixel purchase:", error);
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
    userState?: string;
    userBirthdate?: string | Date;
    userZipCode?: string;
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
      userState,
      userBirthdate,
      userZipCode,
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
        state: userState,
        birthdate: userBirthdate,
        zipCode: userZipCode,
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
    } catch {
      // console.error(`❌ Error sending ${action} to Facebook Conversions API:`, apiError);
    }

    // 3. Track TikTok Pixel
    await trackTikTokEvent(action, commonParams);
    // console.log(`📱 TikTok Pixel: ${action} tracked - ${packageName} - $${value} ${currency}`);
  } catch {
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
  userPhone?: string;
  userFirstName?: string;
  userLastName?: string;
  userState?: string;
  userBirthdate?: string | Date;
  userZipCode?: string;
  paymentIntentId?: string;
  prorationAmount?: number;
  entriesAdded?: number;
  requestContext?: {
    client_ip_address?: string;
    client_user_agent?: string;
    fbc?: string;
    fbp?: string;
    event_source_url?: string;
  };
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
      userPhone,
      userFirstName,
      userLastName,
      userState,
      userBirthdate,
      userZipCode,
      paymentIntentId,
      prorationAmount,
      entriesAdded,
      requestContext,
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

    const capiEventId = paymentIntentId
      ? `upgrade-${subscriptionId}-${paymentIntentId}`
      : `upgrade-${subscriptionId}-${Date.now()}`;
    const hashed = prepareUserData({
      email: userEmail,
      phone: userPhone,
      firstName: userFirstName,
      lastName: userLastName,
      state: userState,
      birthdate: userBirthdate,
      zipCode: userZipCode,
      country: "AU",
      ...(userId && { externalId: userId }),
    });
    if (requestContext?.client_ip_address) hashed.client_ip_address = requestContext.client_ip_address;
    if (requestContext?.client_user_agent) hashed.client_user_agent = requestContext.client_user_agent;
    if (requestContext?.fbc) hashed.fbc = requestContext.fbc;
    if (requestContext?.fbp) hashed.fbp = requestContext.fbp;

    // Custom event — Meta's `Subscribe` standard event is reserved for the *initial*
    // paid subscription start. Firing it on tier changes pollutes the Subscribe
    // optimization signal. See https://www.facebook.com/business/help/402791146561655
    const upgradeFacebookEvent: FacebookEvent = {
      event_name: "MembershipUpgrade",
      event_time: Math.floor(Date.now() / 1000),
      event_id: capiEventId,
      action_source: "website",
      user_data: hashed,
      custom_data: {
        currency,
        value: Math.abs(newValue - oldValue),
        content_type: "product",
        content_ids: [newPackageId],
        content_name: newPackageName,
        package_type: "subscription_upgrade",
        ...(paymentIntentId && { order_id: paymentIntentId }),
      },
      event_source_url: requestContext?.event_source_url ?? getServerEventSourceUrlFallback(),
    };

    await sendFacebookEvent(upgradeFacebookEvent);

    // TikTok: the browser trackTikTokEvent helper below no-ops server-side (window undefined),
    // so fire the real TikTok Events API custom event here — with the SAME event_id as the Meta
    // event — which is what actually delivers upgrades to TikTok (parity with Meta).
    await sendTikTokServerCustomEvent({
      eventName: "MembershipUpgrade",
      eventId: capiEventId,
      value: Math.abs(newValue - oldValue),
      currency,
      packageId: newPackageId,
      packageName: newPackageName,
      packageType: "subscription_upgrade",
      orderId: paymentIntentId,
      user: {
        email: userEmail,
        phone: userPhone,
        firstName: userFirstName,
        lastName: userLastName,
        state: userState,
        birthdate: userBirthdate,
        zipCode: userZipCode,
        externalId: userId,
      },
      requestContext,
    });
    // Legacy browser pixel call (no-op server-side; retained for the shared param shape).
    await trackTikTokEvent("Subscribe", commonParams);
  } catch {
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
  userPhone?: string;
  userFirstName?: string;
  userLastName?: string;
  userState?: string;
  userBirthdate?: string | Date;
  userZipCode?: string;
  paymentIntentId?: string;
  prorationAmount?: number;
  entriesRemoved?: number;
  requestContext?: {
    client_ip_address?: string;
    client_user_agent?: string;
    fbc?: string;
    fbp?: string;
    event_source_url?: string;
  };
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
      userPhone,
      userFirstName,
      userLastName,
      userState,
      userBirthdate,
      userZipCode,
      paymentIntentId,
      prorationAmount,
      entriesRemoved,
      requestContext,
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

    const capiEventId = `downgrade-${subscriptionId}-${Date.now()}`;
    const hashedDown = prepareUserData({
      email: userEmail,
      phone: userPhone,
      firstName: userFirstName,
      lastName: userLastName,
      state: userState,
      birthdate: userBirthdate,
      zipCode: userZipCode,
      country: "AU",
      ...(userId && { externalId: userId }),
    });
    if (requestContext?.client_ip_address) hashedDown.client_ip_address = requestContext.client_ip_address;
    if (requestContext?.client_user_agent) hashedDown.client_user_agent = requestContext.client_user_agent;
    if (requestContext?.fbc) hashedDown.fbc = requestContext.fbc;
    if (requestContext?.fbp) hashedDown.fbp = requestContext.fbp;

    // Custom event — see MembershipUpgrade comment above for rationale.
    const downgradeFacebookEvent: FacebookEvent = {
      event_name: "MembershipDowngrade",
      event_time: Math.floor(Date.now() / 1000),
      event_id: capiEventId,
      action_source: "website",
      user_data: hashedDown,
      custom_data: {
        currency,
        value: Math.abs(newValue - oldValue),
        content_type: "product",
        content_ids: [newPackageId],
        content_name: newPackageName,
        package_type: "subscription_downgrade",
        ...(paymentIntentId && { order_id: paymentIntentId }),
      },
      event_source_url: requestContext?.event_source_url ?? getServerEventSourceUrlFallback(),
    };

    await sendFacebookEvent(downgradeFacebookEvent);

    // TikTok: browser helper below no-ops server-side — fire the real TikTok Events API custom
    // event with the SAME event_id as the Meta event (parity with Meta).
    await sendTikTokServerCustomEvent({
      eventName: "MembershipDowngrade",
      eventId: capiEventId,
      value: Math.abs(newValue - oldValue),
      currency,
      packageId: newPackageId,
      packageName: newPackageName,
      packageType: "subscription_downgrade",
      orderId: paymentIntentId,
      user: {
        email: userEmail,
        phone: userPhone,
        firstName: userFirstName,
        lastName: userLastName,
        state: userState,
        birthdate: userBirthdate,
        zipCode: userZipCode,
        externalId: userId,
      },
      requestContext,
    });
    // Legacy browser pixel call (no-op server-side; retained for the shared param shape).
    await trackTikTokEvent("Subscribe", commonParams);
  } catch {
    // console.error(`❌ Error tracking pixel subscription downgrade:`, error);
  }
}

/**
 * Subscription-renewal tracking seam — **intentionally sends nothing** (panel F-020).
 *
 * Renewals are deliberately excluded from ad-platform conversion tracking: counting a
 * renewal as a Purchase inflates reported revenue and corrupts ROAS. That rule already
 * held for Facebook; the old docstring's claim that renewals were "tracked to
 * TikTok/Klaviyo for internal analytics" was **false** — the only call in the body was
 * the browser helper `trackTikTokEvent`, and this function runs SERVER-side (Stripe
 * webhook → `stripe-webhook-handlers`), where that helper returns immediately because
 * `window` is undefined. There was no Klaviyo call either. So it has always been a
 * no-op wearing a misleading label.
 *
 * Kept (rather than deleted along with its webhook call) as the documented seam for if
 * renewals ever need FIRST-PARTY internal analytics — removing it would mean editing
 * the Stripe webhook handler, a payments risk path, for zero behavioral gain. If you
 * add anything here, it must NOT be an ad-platform conversion event.
 */
export async function trackPixelSubscriptionRenewal(_params: {
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
  // No-op by design — see the docstring above. The previous body destructured every
  // param and built a `commonParams` payload solely to hand to a browser-only helper
  // that cannot run here, so it has been removed rather than left as dead weight that
  // reads like working tracking.
}
