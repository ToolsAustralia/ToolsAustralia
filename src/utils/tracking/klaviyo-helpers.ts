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
 * @param traits - Optional user properties (firstName, lastName, phone, etc.)
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
 * Track a custom event in Klaviyo.
 *
 * This is the main low-level helper for all Klaviyo events and is wrapped by
 * higher-level hooks (e.g. useKlaviyoTracking). It also respects pixel consent
 * so that disabling tracking in one place affects all downstream events.
 *
 * @param eventName - Name of the event (e.g., "Added to Cart", "Placed Order")
 * @param properties - Optional event properties (value, currency, productId, etc.)
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

  try {
    // Klaviyo track format: ["track", eventName, properties]
    window.klaviyo.push(["track", eventName, properties || {}]);

    if (process.env.NODE_ENV === "development") {
      console.log(`📧 Klaviyo: Event tracked - ${eventName}`, properties);
    }
  } catch (error) {
    // Silently fail - don't break user experience
    if (process.env.NODE_ENV === "development") {
      console.error(`❌ Klaviyo: Error tracking event ${eventName}`, error);
    }
  }
}

/**
 * Track a page view in Klaviyo.
 *
 * This is an explicit page view helper, mainly used by higher-level hooks.
 * It is consent-aware and will no-op if tracking has been disabled.
 *
 * @param properties - Optional page properties (title, url, etc.)
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
    // Klaviyo page format: ["page", properties]
    window.klaviyo.push(["page", properties || {}]);

    if (process.env.NODE_ENV === "development") {
      console.log("📧 Klaviyo: Page view tracked", properties);
    }
  } catch (error) {
    // Silently fail - don't break user experience
    if (process.env.NODE_ENV === "development") {
      console.error("❌ Klaviyo: Error tracking page view", error);
    }
  }
}
