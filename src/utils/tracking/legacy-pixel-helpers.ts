/**
 * legacy-pixel-helpers.ts
 *
 * Legacy imperative browser-pixel event helpers for Facebook + TikTok.
 *
 * These moved here (perf Tier-2) from the now-deleted `src/components/FacebookPixel.tsx`
 * and `src/components/TikTokPixel.tsx`. Those files each carried a never-mounted loader
 * COMPONENT plus these helper functions; the components were dead code (the live pixel
 * loaders are `ConversionPixels` → `facebookProvider`/`tiktokProvider`), so the components
 * were removed and only these still-consumed helpers were relocated — with identical
 * export names, zero behaviour change.
 *
 * Consumers: `hooks/usePixelTracking.ts`, `utils/tracking/pixel-purchase-tracking.ts`,
 * `components/modals/MembershipModal`. NEW code should prefer `trackConversion(...)`
 * (dispatch-client) / the provider registry for proper Pixel↔CAPI dedup across providers.
 *
 * `window.fbq` is typed by the ambient `Window` augmentation in
 * `src/lib/tracking/providers/facebook.ts`; TikTok helpers delegate to `tiktokProvider`
 * (they never touch `window.ttq` directly), so no local global augmentation is needed.
 */

import { trackConversion } from "@/lib/tracking/dispatch-client";
import { buildPurchaseEvent, eventTimeNow } from "@/lib/tracking/canonical-event";
import { getAllowedHostnames } from "@/lib/tracking/hostname-gate";
import { tiktokProvider } from "@/lib/tracking/providers/tiktok";

// ── Facebook ────────────────────────────────────────────────────────────────

/**
 * Hostnames where the browser pixel is allowed to fire. Reads from
 * `getAllowedHostnames()` so the staging-opt-in env var
 * `NEXT_PUBLIC_PIXEL_ALLOWED_HOSTNAMES` actually takes effect here too.
 * Previously this was hardcoded to production-only, which broke staging
 * end-to-end testing (the inline init script and trackFacebookEvent both
 * call this).
 */
export function isProductionBrowserHostname(hostname: string): boolean {
  return getAllowedHostnames().includes(hostname);
}

// Track recent events to prevent duplicates (within 1 second)
const recentEvents = new Map<string, number>(); // eventKey -> timestamp

/**
 * Track Facebook Pixel event with optional EventID for deduplication
 * Uses trackSingle when eventID is provided to enable deduplication with Conversions API
 *
 * @param eventName - Name of the event to track
 * @param parameters - Optional event parameters including eventID
 */
/**
 * Track Facebook Pixel event with optional EventID for deduplication
 * Includes retry mechanism to ensure pixel is initialized before tracking
 *
 * @param eventName - Name of the event to track
 * @param parameters - Optional event parameters including eventID
 * @param retries - Internal parameter for retry mechanism (default: 3)
 * @param delay - Delay between retries in milliseconds (default: 500)
 */
export const trackFacebookEvent = (
  eventName: string,
  parameters?: Record<string, unknown>,
  retries: number = 3,
  delay: number = 500
) => {
  if (typeof window === "undefined") {
    // console.warn("❌ Facebook Pixel: Window not available");
    return;
  }

  if (!isProductionBrowserHostname(window.location.hostname)) {
    return;
  }

  // Check if pixel is ready (initialized and loaded)
  // fbq exists but might not be fully loaded yet
  if (!window.fbq) {
    if (retries > 0) {
      // Retry after delay if pixel not loaded yet
      setTimeout(() => trackFacebookEvent(eventName, parameters, retries - 1, delay), delay);
      return;
    }
    // console.warn("❌ Facebook Pixel: Not loaded after retries");
    return;
  }

  // Even if fbq exists, the pixel library might not be fully loaded
  // fbq.queue exists when library is loading, fbq.loaded is true when ready
  const fbqLoaded = (window.fbq as { loaded?: boolean }).loaded === true;
  if (!fbqLoaded && retries > 0) {
    // Pixel library is still loading, retry after delay
    setTimeout(() => trackFacebookEvent(eventName, parameters, retries - 1, delay), delay);
    return;
  }

  // Pull eventID out of parameters — Meta only deduplicates when eventID is passed
  // as the 4th-argument options object, NOT when it sits inside the 3rd-arg customData.
  // See https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events/
  const { eventID: rawEventID, ...customData } = parameters ?? {};
  const eventID = typeof rawEventID === "string" && rawEventID.length > 0 ? rawEventID : undefined;

  try {
    // Validate event name (must be a string)
    if (typeof eventName !== "string" || !eventName.trim()) {
      console.error("❌ Facebook Pixel: Invalid event name", eventName);
      return;
    }

    // Create event key for the local in-memory 1-second debounce (prevents accidental
    // re-fires from re-renders). Keyed by eventID when available so two distinct
    // conversions with different IDs don't get debounced against each other.
    const eventKey = eventID ? `${eventName}_${eventID}` : `${eventName}_${JSON.stringify(customData)}`;

    const now = Date.now();
    const lastSent = recentEvents.get(eventKey);

    // Prevent duplicate events within 1 second (unless it has a unique eventID)
    if (lastSent && now - lastSent < 1000 && !eventID) {
      return;
    }

    // 4-arg form when eventID is present so Meta can dedup against the matching CAPI event.
    // 3-arg form otherwise — fbq normalises a missing 4th arg, but we keep them separate
    // to avoid sending an empty {eventID: undefined} object that Meta logs as a malformed param.
    if (eventID) {
      window.fbq("track", eventName, customData, { eventID });
    } else {
      window.fbq("track", eventName, customData);
    }

    // Record event timestamp for deduplication
    recentEvents.set(eventKey, now);

    // Clean up old entries (older than 5 seconds)
    if (recentEvents.size > 100) {
      for (const [key, timestamp] of recentEvents.entries()) {
        if (now - timestamp > 5000) {
          recentEvents.delete(key);
        }
      }
    }

    if (process.env.NODE_ENV === "development") {
      if (eventID) {
        // console.log(`✅ Facebook Pixel: ${eventName} sent successfully with deduplication`);
      } else {
        // console.log(`✅ Facebook Pixel: ${eventName} sent successfully`);
      }
    }
  } catch (error) {
    // Only log errors in development to avoid console spam in production
    if (process.env.NODE_ENV === "development") {
      console.error(`❌ Facebook Pixel: Error sending ${eventName}:`, error);
    }
    // If error occurs and we have retries left, try again
    if (retries > 0) {
      setTimeout(() => trackFacebookEvent(eventName, parameters, retries - 1, delay), delay);
    }
  }
};

export const trackPurchase = (value: number, currency: string = "AUD", orderId?: string) => {
  trackFacebookEvent("Purchase", {
    value,
    currency,
    content_type: "product",
    ...(orderId && { order_id: orderId }),
  });
};

/**
 * Track Purchase event with eventID for browser↔CAPI deduplication.
 *
 * After the provider-registry refactor, this fans out to every enabled pixel
 * (FB + TikTok + Snap) via the dispatcher. Each provider maps eventId to its
 * own dedup field name (FB: eventID, TikTok: event_id, Snap: client_dedup_id).
 *
 * @param value - Purchase value in dollars (not cents)
 * @param currency - Currency code (e.g. "AUD")
 * @param eventId - Unique event ID; MUST match server-side CAPI event_id for dedup
 * @param orderId - Optional order_id for custom_data
 */
export const trackPurchaseWithEventId = (
  value: number,
  currency: string,
  eventId: string,
  orderId?: string,
) => {
  if (typeof window === "undefined") return;
  if (!Number.isFinite(value) || value <= 0) return;
  if (!eventId || !eventId.trim()) return;

  trackConversion(
    buildPurchaseEvent({
      value,
      currency: currency || "AUD",
      eventId,
      customData: { orderId, contentType: "product" },
      eventSourceUrl: window.location.href,
    }),
  );
};

export const trackAddToCart = (value: number, currency: string = "AUD", productId?: string) => {
  trackFacebookEvent("AddToCart", {
    value,
    currency,
    content_type: "product",
    ...(productId && { content_ids: [productId] }),
  });
};

export const trackInitiateCheckout = (value: number, currency: string = "AUD", numItems?: number) => {
  trackFacebookEvent("InitiateCheckout", {
    value,
    currency,
    content_type: "product",
    ...(numItems && { num_items: numItems }),
  });
};

/**
 * Track ViewContent event with enhanced custom parameters
 *
 * @param value - Product/draw value
 * @param currency - Currency code (default: "AUD")
 * @param productId - Optional product/draw ID
 * @param params - Optional additional parameters (content_category, content_name, brand, page_type, user_type)
 */
export const trackViewContent = (
  value: number,
  currency: string = "AUD",
  productId?: string,
  params?: {
    content_category?: string;
    content_name?: string;
    brand?: string;
    page_type?: string;
    user_type?: "guest" | "member";
    platform?: string;
    [key: string]: unknown;
  }
) => {
  // Build parameters with defaults and custom values
  const viewContentParams: Record<string, unknown> = {
    value,
    currency,
    content_type: "product",
    platform: "tools-australia-website",
    ...(productId && { content_ids: [productId] }),
    ...(params?.content_category && { content_category: params.content_category }),
    ...(params?.content_name && { content_name: params.content_name }),
    ...(params?.brand && { brand: params.brand }),
    ...(params?.page_type && { page_type: params.page_type }),
    ...(params?.user_type && { user_type: params.user_type }),
  };

  // Add any additional custom parameters (excluding already handled ones)
  if (params) {
    const excludedKeys = ["content_category", "content_name", "brand", "page_type", "user_type", "platform"];
    Object.keys(params).forEach((key) => {
      if (!excludedKeys.includes(key)) {
        viewContentParams[key] = params[key];
      }
    });
  }

  trackFacebookEvent("ViewContent", viewContentParams);
};

export const trackSearch = (searchString: string) => {
  trackFacebookEvent("Search", {
    search_string: searchString,
    content_type: "product",
  });
};

/**
 * Track CompleteRegistration event with enhanced custom parameters
 * Note: registration_method and content_type parameters removed as per requirements
 *
 * @param params - Optional parameters including source, referrer, referrer_domain, utm_source, utm_medium, utm_campaign, signup_flow, initial_interest, platform, user_type
 */
export const trackCompleteRegistration = (params?: {
  source?: string;
  referrer?: string;
  referrer_domain?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  signup_flow?: string;
  initial_interest?: string;
  platform?: string;
  user_type?: "guest" | "member";
  [key: string]: unknown;
}) => {
  // Build parameters with defaults (removed registration_method and content_type)
  const registrationParams: Record<string, unknown> = {
    platform: "tools-australia-website",
    ...(params?.source && { source: params.source }),
    ...(params?.referrer && { referrer: params.referrer }),
    ...(params?.referrer_domain && { referrer_domain: params.referrer_domain }),
    ...(params?.utm_source && { utm_source: params.utm_source }),
    ...(params?.utm_medium && { utm_medium: params.utm_medium }),
    ...(params?.utm_campaign && { utm_campaign: params.utm_campaign }),
    ...(params?.signup_flow && { signup_flow: params.signup_flow }),
    ...(params?.initial_interest && { initial_interest: params.initial_interest }),
    ...(params?.user_type && { user_type: params.user_type }),
  };

  // Add any additional custom parameters (excluding already handled ones)
  if (params) {
    const excludedKeys = [
      "source",
      "referrer",
      "referrer_domain",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "signup_flow",
      "initial_interest",
      "platform",
      "user_type",
    ];
    Object.keys(params).forEach((key) => {
      if (!excludedKeys.includes(key)) {
        registrationParams[key] = params[key];
      }
    });
  }

  trackFacebookEvent("CompleteRegistration", registrationParams);
};

export const trackLead = (value?: number, currency: string = "AUD") => {
  trackFacebookEvent("Lead", {
    content_type: "lead",
    ...(value && { value, currency }),
  });
};

export const trackSubscribe = (value?: number, currency: string = "AUD") => {
  trackFacebookEvent("Subscribe", {
    content_type: "subscription",
    ...(value && { value, currency }),
  });
};

/**
 * Track AddPaymentInfo event - fired when user enters payment information
 * This is a standard Facebook Pixel event for checkout optimization
 */
export const trackAddPaymentInfo = (
  value: number,
  currency: string = "AUD",
  contentIds?: string[],
  numItems?: number
) => {
  trackFacebookEvent("AddPaymentInfo", {
    value,
    currency,
    content_type: "product",
    ...(contentIds && { content_ids: contentIds }),
    ...(numItems && { num_items: numItems }),
  });
};

/**
 * Track RemoveFromCart event - fired when user removes item from cart
 * This helps identify cart abandonment reasons and optimize retargeting
 */
export const trackRemoveFromCart = (
  value: number,
  currency: string = "AUD",
  productId?: string,
  contentName?: string
) => {
  trackFacebookEvent("RemoveFromCart", {
    value,
    currency,
    content_type: "product",
    ...(productId && { content_ids: [productId] }),
    ...(contentName && { content_name: contentName }),
  });
};

// ── TikTok ──────────────────────────────────────────────────────────────────

/**
 * Track a TikTok-only event by name + params.
 *
 * Legacy callers (subscription helpers in pixel-purchase-tracking.ts, etc.) don't
 * have a canonical eventId, so we synthesize one. This means dedup with TikTok
 * Events API won't be effective — but legacy callers also didn't have CAPI fan-out,
 * so this matches today's behavior. NEW code should use `trackConversion(...)`
 * with a real eventId for proper Pixel↔CAPI dedup across all providers.
 *
 * Goes through `tiktokProvider.pixelTrack` so the production-hostname gate
 * AND missing-credentials check (spec §3 invariants #2 and #4) are enforced.
 */
export const trackTikTokEvent = (eventName: string, parameters?: Record<string, unknown>) => {
  if (typeof window === "undefined") return;
  const en = tiktokProvider.enabled();
  if (!en.pixel) return;
  const allowed = tiktokProvider.productionHostnames();
  if (!allowed.includes(window.location.hostname)) return;
  try {
    tiktokProvider.pixelTrack({
      eventName,
      eventId: `legacy-${eventName}-${Date.now()}`,
      eventTime: eventTimeNow(),
      providerData: { tiktok: parameters },
    });
  } catch {
    // Silently fail — TikTok is not critical-path.
  }
};

export const trackTikTokPurchase = (value: number, currency: string = "AUD", orderId?: string) => {
  trackTikTokEvent("CompletePayment", {
    value,
    currency,
    content_type: "product",
    ...(orderId && { order_id: orderId }),
  });
};

export const trackTikTokAddToCart = (value: number, currency: string = "AUD", productId?: string) => {
  trackTikTokEvent("AddToCart", {
    value,
    currency,
    content_type: "product",
    ...(productId && { content_ids: [productId] }),
  });
};

export const trackTikTokInitiateCheckout = (value: number, currency: string = "AUD", numItems?: number) => {
  trackTikTokEvent("InitiateCheckout", {
    value,
    currency,
    content_type: "product",
    ...(numItems && { num_items: numItems }),
  });
};

export const trackTikTokViewContent = (value: number, currency: string = "AUD", productId?: string) => {
  trackTikTokEvent("ViewContent", {
    value,
    currency,
    content_type: "product",
    ...(productId && { content_ids: [productId] }),
  });
};

export const trackTikTokSearch = (searchString: string) => {
  trackTikTokEvent("Search", {
    search_string: searchString,
    content_type: "product",
  });
};

export const trackTikTokCompleteRegistration = (method?: string) => {
  trackTikTokEvent("CompleteRegistration", {
    content_type: "user",
    ...(method && { registration_method: method }),
  });
};

export const trackTikTokLead = (value?: number, currency: string = "AUD") => {
  trackTikTokEvent("SubmitForm", {
    content_type: "lead",
    ...(value && { value, currency }),
  });
};

export const trackTikTokSubscribe = (value?: number, currency: string = "AUD") => {
  trackTikTokEvent("Subscribe", {
    content_type: "subscription",
    ...(value && { value, currency }),
  });
};

export const trackTikTokContact = () => {
  trackTikTokEvent("Contact", {
    content_type: "contact",
  });
};

export const trackTikTokCustomEvent = (eventName: string, parameters?: Record<string, unknown>) => {
  trackTikTokEvent(eventName, parameters);
};
