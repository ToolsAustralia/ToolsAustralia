/**
 * Klaviyo Tracking Helper Utilities
 *
 * Provides core utility functions for Klaviyo client-side tracking.
 * These functions handle user identification, event tracking, and page view tracking.
 *
 * Follows the same pattern as facebook-helpers.ts and pixel-purchase-tracking.ts
 * for consistency across the codebase.
 *
 * @author Senior Full-Stack Developer
 * @version 1.0.0
 */

import { hasPixelConsent } from "@/components/PixelTracker";

/**
 * Identify a user in Klaviyo.
 *
 * This links the current browser session to a Klaviyo profile using the
 * user's email and any additional traits we want to attach.
 * We respect the shared pixel consent helper so that future consent changes
 * automatically apply to Klaviyo as well.
 *
 * @param email - User's email address (required)
 * @param traits - Optional user properties keyed snake_case to match Klaviyo
 *                 standard fields (first_name, last_name, phone_number, user_id, ...)
 */
export function identifyKlaviyoUser(email: string, traits?: Record<string, unknown>): void {
  // If the user has not granted tracking consent, skip identifying them in Klaviyo.
  if (!hasPixelConsent()) {
    return;
  }

  if (typeof window === "undefined" || !window.klaviyo) {
    if (process.env.NODE_ENV === "development") {
      console.warn("⚠️ Klaviyo: Not loaded or not available");
    }
    return;
  }

  try {
    // Klaviyo identify format: ["identify", { email, ...traits }]
    window.klaviyo.push(["identify", { email, ...traits }]);

    if (process.env.NODE_ENV === "development") {
      console.log("📧 Klaviyo: User identified", { email, traits });
    }
  } catch (error) {
    // Silently fail - don't break user experience
    if (process.env.NODE_ENV === "development") {
      console.error("❌ Klaviyo: Error identifying user", error);
    }
  }
}

/**
 * Format event name with [DEV] prefix in development mode (client-side mirror
 * of the server-side `formatEventName` in `src/lib/klaviyo.ts:149`).
 *
 * Without this, client-side events fire to Klaviyo with bare names while
 * server-side events get `[DEV]` prefixes — they end up mixed on the same
 * profile in Klaviyo's UI, making dev/prod isolation harder during testing.
 *
 * Uses `NODE_ENV === "development"` (matches the server-side fallback when
 * `KLAVIYO_MODE` env var is not explicitly set — which is the default).
 * Idempotent: skips when the name already starts with `[DEV] `.
 */
function formatClientEventName(eventName: string): string {
  if (process.env.NODE_ENV === "development" && !eventName.startsWith("[DEV] ")) {
    return `[DEV] ${eventName}`;
  }
  return eventName;
}

/**
 * Track a custom event in Klaviyo.
 *
 * This is the main low-level helper for all Klaviyo events and is wrapped by
 * higher-level hooks (e.g. useKlaviyoTracking). It also respects pixel consent
 * so that disabling tracking in one place affects all downstream events.
 *
 * @param eventName - Name of the event (e.g., "Added to Cart", "Placed Order").
 *                    Automatically prefixed with "[DEV] " in development.
 * @param properties - Optional event properties keyed snake_case
 *                     (value, currency, product_id, order_id, item_count, ...)
 */
export function trackKlaviyoEvent(eventName: string, properties?: Record<string, unknown>): void {
  // If tracking consent has not been granted, do not send any events to Klaviyo.
  if (!hasPixelConsent()) {
    return;
  }

  if (typeof window === "undefined" || !window.klaviyo) {
    if (process.env.NODE_ENV === "development") {
      console.warn("⚠️ Klaviyo: Not loaded or not available");
    }
    return;
  }

  // Match server-side klaviyo.ts:formatEventName behaviour so dev/prod events
  // stay isolated in Klaviyo's UI (otherwise client-side events would fire
  // bare while server-side get the [DEV] prefix, mixing them on profiles).
  const finalEventName = formatClientEventName(eventName);

  try {
    // Klaviyo track format: ["track", eventName, properties]
    window.klaviyo.push(["track", finalEventName, properties || {}]);

    if (process.env.NODE_ENV === "development") {
      console.log(`📧 Klaviyo: Event tracked - ${finalEventName}`, properties);
    }
  } catch (error) {
    // Silently fail - don't break user experience
    if (process.env.NODE_ENV === "development") {
      console.error(`❌ Klaviyo: Error tracking event ${finalEventName}`, error);
    }
  }
}

/**
 * Track a page view in Klaviyo using the "Viewed Page" event format.
 *
 * This helper uses Klaviyo's recommended event format: `klaviyo.track("Viewed Page", {...})`
 * which creates a visible metric in the Klaviyo Metrics dashboard. This is preferred over
 * the basic `["page"]` call which doesn't create a trackable metric.
 *
 * Note: This helper is currently unused as page tracking is handled by `KlaviyoPageTracker`
 * component. It's kept for future flexibility and API consistency.
 *
 * @param properties - Page properties following Klaviyo's "Viewed Page" format:
 *   - PageName: Name of the page (e.g., "Product Detail", "Home")
 *   - PageURL: Full URL of the page
 *   - PageType: Type of page (e.g., "product", "home", "checkout")
 *   - Additional custom properties as needed
 *
 * @example
 * ```typescript
 * trackKlaviyoPageView({
 *   PageName: "Product Detail",
 *   PageURL: "https://example.com/shop/product",
 *   PageType: "product"
 * });
 * ```
 */
export function trackKlaviyoPageView(properties?: Record<string, unknown>): void {
  if (!hasPixelConsent()) {
    return;
  }

  if (typeof window === "undefined" || !window.klaviyo) {
    if (process.env.NODE_ENV === "development") {
      console.warn("⚠️ Klaviyo: Not loaded or not available");
    }
    return;
  }

  try {
    // Use Klaviyo's recommended "Viewed Page" event format
    // This creates a visible metric in Klaviyo Metrics dashboard
    // Format: klaviyo.track("Viewed Page", { PageName, PageURL, PageType, ... })
    trackKlaviyoEvent("Viewed Page", properties || {});

    if (process.env.NODE_ENV === "development") {
      console.log("📧 Klaviyo: Viewed Page event tracked", properties);
    }
  } catch (error) {
    // Silently fail - don't break user experience
    if (process.env.NODE_ENV === "development") {
      console.error("❌ Klaviyo: Error tracking page view", error);
    }
  }
}
