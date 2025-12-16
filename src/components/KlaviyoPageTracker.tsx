"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { hasPixelConsent } from "@/components/PixelTracker";
import { extractPageMetadata } from "@/utils/tracking/page-metadata-helpers";
import { trackKlaviyoEvent } from "@/utils/tracking/klaviyo-helpers";

/**
 * Klaviyo Page View Tracker Component
 *
 * Automatically tracks page views on route changes using Klaviyo's "Viewed Page" event.
 * This ensures page views appear in Klaviyo Metrics dashboard for analytics.
 *
 * Uses Klaviyo's recommended event format: `klaviyo.track("Viewed Page", {...})`
 * instead of the basic `["page"]` call, which doesn't create a visible metric.
 *
 * This component follows the same pattern as FacebookPixel and TikTokPixel page tracking
 * for consistency across the codebase.
 *
 * Deduplication:
 * - Tracks once per route change (enforced by useEffect dependency on pathname)
 * - This is the ONLY component that tracks general page views
 * - Product-specific views use "Viewed Product" event (different metric)
 *
 * @example
 * ```tsx
 * <KlaviyoPageTracker />
 * ```
 */
export default function KlaviyoPageTracker() {
  const pathname = usePathname();

  useEffect(() => {
    // Respect global pixel consent settings. This is currently auto-accepted,
    // but wiring Klaviyo to the same helper means a future consent modal will
    // automatically apply to Klaviyo events as well.
    if (!hasPixelConsent()) {
      return;
    }

    // Only track if Klaviyo is loaded and initialized
    if (typeof window === "undefined" || !window.klaviyo || !window._klOnsite) {
      return;
    }

    try {
      // Extract page metadata for better analytics
      const pageMetadata = extractPageMetadata(
        pathname,
        typeof window !== "undefined" ? window.location.href : undefined
      );

      // Track page view using Klaviyo's recommended "Viewed Page" event format
      // This creates a visible metric in Klaviyo Metrics dashboard
      // Format follows Klaviyo's current best practices (2024-2025)
      trackKlaviyoEvent("Viewed Page", {
        PageName: pageMetadata.page_name || pathname,
        PageURL: pageMetadata.page_url || (typeof window !== "undefined" ? window.location.href : ""),
        PageType: pageMetadata.page_type,
        // Include pathname for additional context
        Pathname: pathname,
      });

      if (process.env.NODE_ENV === "development") {
        console.log("📧 Klaviyo: Viewed Page event tracked", {
          pathname,
          pageMetadata,
        });
      }
    } catch (error) {
      // Silently fail - don't break user experience
      if (process.env.NODE_ENV === "development") {
        console.warn("⚠️ Klaviyo: Error tracking page view", error);
      }
    }
  }, [pathname]);

  // This component doesn't render anything
  return null;
}
