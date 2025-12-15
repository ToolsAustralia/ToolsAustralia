"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { hasPixelConsent } from "@/components/PixelTracker";

/**
 * Klaviyo Page View Tracker Component
 *
 * Automatically tracks page views on route changes using Klaviyo onsite JavaScript.
 * This component follows the same pattern as FacebookPixel and TikTokPixel page tracking.
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
      // Track page view using Klaviyo's page event
      // This is the standard way to track page views in Klaviyo
      window.klaviyo.push(["page"]);

      if (process.env.NODE_ENV === "development") {
        console.log("📧 Klaviyo: Page view tracked", pathname);
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
