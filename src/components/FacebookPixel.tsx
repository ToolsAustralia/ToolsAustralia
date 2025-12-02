"use client";

import React, { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";

declare global {
  interface Window {
    fbq: (
      command: string,
      eventNameOrPixelId?: string,
      eventNameOrParams?: string | Record<string, unknown>,
      parameters?: Record<string, unknown>
    ) => void;
    _fbp?: string; // Facebook Browser ID cookie
    _fbPixelInit?: boolean; // Global flag to prevent multiple initializations
  }
}

interface FacebookPixelProps {
  pixelId: string;
  disabled?: boolean;
  /**
   * Data Processing Options for GDPR/CCPA compliance
   * Format: [LDU, country, state] where:
   * - LDU: 0 = no restriction, 1 = Limited Data Use
   * - country: ISO 3166-1 alpha-2 country code (e.g., "US", "GB")
   * - state: ISO 3166-2 state code (e.g., "CA" for California)
   * Example: [1, "US", "CA"] for California CCPA compliance
   */
  dataProcessingOptions?: [number, string, string?];
  /**
   * Data Processing Country Code (ISO 3166-1 alpha-2)
   * Used for GDPR compliance
   */
  dataProcessingCountry?: number;
  /**
   * Data Processing State Code (ISO 3166-2)
   * Used for CCPA compliance
   */
  dataProcessingState?: number;
}

// Store pixel ID globally for use in tracking functions (may be used by other modules)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let globalPixelId: string | null = null;
// Track if pixel has been initialized (global guard to prevent multiple initializations)
let pixelInitialized = false;
// Track recent events to prevent duplicates (within 1 second)
const recentEvents = new Map<string, number>(); // eventKey -> timestamp

export default function FacebookPixel({
  pixelId,
  disabled = false,
  dataProcessingOptions,
  dataProcessingCountry,
  dataProcessingState,
}: FacebookPixelProps) {
  const pathname = usePathname();
  const [isInitialized, setIsInitialized] = useState(pixelInitialized); // Initialize from global state
  const hasTrackedInitialPageView = React.useRef(false); // Track if we've sent initial PageView
  const scriptLoadedRef = React.useRef(false); // Track if script has been loaded

  // Store pixel ID globally for use in tracking functions
  globalPixelId = pixelId;

  // Check if script already exists in DOM to prevent duplicates
  useEffect(() => {
    if (typeof window !== "undefined") {
      const existingScript = document.getElementById("facebook-pixel-script");
      if (existingScript || pixelInitialized) {
        // Script already exists or pixel initialized
        if (pixelInitialized) {
          setIsInitialized(true);
          hasTrackedInitialPageView.current = true;
        }
      }
    }
  }, []);

  // Track page view on route change (only if pixel is loaded and not initial load)
  useEffect(() => {
    // Only track on route changes, not initial load (initial PageView is queued in inline script)
    if (!isInitialized || !hasTrackedInitialPageView.current) {
      return;
    }

    if (typeof window !== "undefined" && typeof window.fbq === "function") {
      window.fbq("track", "PageView");
      if (process.env.NODE_ENV === "development") {
        console.log("✅ Facebook Pixel: PageView tracked on route change");
      }
    }
  }, [pathname, isInitialized]);

  // Fallback: Verify PageView fired after pixel loads (safety net)
  // Moved before early returns to satisfy React Hooks rules
  useEffect(() => {
    if (!isInitialized || hasTrackedInitialPageView.current) {
      return;
    }

    // Check if PageView was actually sent (verify after 2 seconds)
    const verifyPageView = setTimeout(() => {
      if (typeof window !== "undefined" && window.fbq) {
        // Try to manually trigger PageView if it didn't fire
        // This is a safety net in case the queued PageView didn't execute
        try {
          window.fbq("track", "PageView");
          hasTrackedInitialPageView.current = true;
          if (process.env.NODE_ENV === "development") {
            console.log("✅ Facebook Pixel: PageView verified/triggered (fallback)");
          }
        } catch (error) {
          if (process.env.NODE_ENV === "development") {
            console.warn("⚠️ Facebook Pixel: Could not verify PageView", error);
          }
        }
      }
    }, 2000);

    return () => clearTimeout(verifyPageView);
  }, [isInitialized]);

  // Don't load if disabled or no pixel ID
  if (disabled || !pixelId) {
    return null;
  }

  // If pixel is already initialized globally, don't render script again
  if (pixelInitialized && scriptLoadedRef.current) {
    return null; // Don't render script again
  }

  // Mark pixel as ready when script loads
  // The inline script queues init and PageView, which will execute when fbevents.js loads
  const handleScriptLoad = () => {
    // Prevent multiple calls
    if (scriptLoadedRef.current) {
      return;
    }
    scriptLoadedRef.current = true;

    // Wait a bit for fbevents.js to load, then mark as initialized
    const checkPixelReady = () => {
      if (typeof window !== "undefined" && window.fbq) {
        const fbqLoaded = (window.fbq as { loaded?: boolean }).loaded === true;
        if (fbqLoaded && !pixelInitialized) {
          pixelInitialized = true;
          setIsInitialized(true);
          hasTrackedInitialPageView.current = true; // PageView was queued in inline script
          if (process.env.NODE_ENV === "development") {
            console.log("✅ Facebook Pixel ready:", pixelId);
          }
        } else if (!fbqLoaded) {
          // fbevents.js not loaded yet, check again
          setTimeout(checkPixelReady, 100);
        }
      }
    };

    // Start checking after a short delay
    setTimeout(checkPixelReady, 200);
  };

  return (
    <>
      {/* Use Next.js Script component for optimal loading performance */}
      {/* Only render if not already initialized */}
      {!pixelInitialized && (
        <Script
          id="facebook-pixel-script"
          strategy="afterInteractive"
          onLoad={handleScriptLoad}
          dangerouslySetInnerHTML={{
            __html: `
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              // Queue init and PageView only once - these will execute when fbevents.js loads
              // Note: fbq function queues commands automatically if library not loaded yet
              // Remove window.fbq check to avoid race condition - fbq is created in this script
              if(typeof window !== 'undefined' && !window._fbPixelInit) {
                window._fbPixelInit = true; // Global flag to prevent multiple inits
                
                // Initialize pixel with optional data processing options for GDPR/CCPA compliance
                // fbq will queue these commands if fbevents.js hasn't loaded yet
                ${
                  dataProcessingOptions
                    ? `window.fbq('init', '${pixelId}', ${JSON.stringify(dataProcessingOptions)});`
                    : dataProcessingCountry !== undefined
                    ? `window.fbq('init', '${pixelId}', null, ${dataProcessingCountry}, ${dataProcessingState || 0});`
                    : `window.fbq('init', '${pixelId}');`
                }
                window.fbq('track', 'PageView');
              }
            `,
          }}
        />
      )}
      {/* Noscript fallback for users with JavaScript disabled */}
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          src={`https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`}
          alt=""
        />
      </noscript>
    </>
  );
}

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
    console.warn("❌ Facebook Pixel: Window not available");
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
    console.warn("❌ Facebook Pixel: Not loaded after retries");
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

  // Check if eventID is provided for deduplication
  const eventID = parameters?.eventID as string | undefined;

  // Prepare event parameters (Meta supports eventID in regular track for deduplication)
  // When eventID is included in the parameters, Meta automatically handles deduplication
  // between browser pixel and Conversions API events with the same eventID
  const eventParams = { ...parameters };

  try {
    // Validate event name (must be a string)
    if (typeof eventName !== "string" || !eventName.trim()) {
      console.error("❌ Facebook Pixel: Invalid event name", eventName);
      return;
    }

    // Validate event parameters (must be an object if provided)
    if (eventParams && typeof eventParams !== "object") {
      console.error("❌ Facebook Pixel: Event parameters must be an object", eventParams);
      return;
    }

    // Create event key for deduplication (prevent same event within 1 second)
    const eventKey = eventID ? `${eventName}_${eventID}` : `${eventName}_${JSON.stringify(eventParams)}`;

    const now = Date.now();
    const lastSent = recentEvents.get(eventKey);

    // Prevent duplicate events within 1 second (unless it has a unique eventID)
    if (lastSent && now - lastSent < 1000 && !eventID) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`⚠️ Facebook Pixel: Duplicate ${eventName} event prevented (sent ${now - lastSent}ms ago)`);
      }
      return;
    }

    // Use regular track with eventID parameter for deduplication
    // Meta automatically handles deduplication when eventID matches between browser pixel and Conversions API
    if (process.env.NODE_ENV === "development") {
      if (eventID) {
        console.log(`📘 Facebook Pixel: Sending ${eventName} with EventID: ${eventID}`, eventParams);
      } else {
        console.log(`📘 Facebook Pixel: Sending ${eventName}`, eventParams);
      }
    }

    // Use regular track - it works even if pixel isn't fully initialized (queues the event)
    // This is the recommended approach per Facebook's documentation
    window.fbq("track", eventName, eventParams);

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
        console.log(`✅ Facebook Pixel: ${eventName} sent successfully with deduplication`);
      } else {
        console.log(`✅ Facebook Pixel: ${eventName} sent successfully`);
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

export const trackViewContent = (value: number, currency: string = "AUD", productId?: string) => {
  trackFacebookEvent("ViewContent", {
    value,
    currency,
    content_type: "product",
    ...(productId && { content_ids: [productId] }),
  });
};

export const trackSearch = (searchString: string) => {
  trackFacebookEvent("Search", {
    search_string: searchString,
    content_type: "product",
  });
};

export const trackCompleteRegistration = (method?: string) => {
  trackFacebookEvent("CompleteRegistration", {
    content_type: "user",
    ...(method && { registration_method: method }),
  });
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
