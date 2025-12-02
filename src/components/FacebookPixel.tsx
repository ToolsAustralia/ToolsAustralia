"use client";

import React, { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { extractPageMetadata } from "@/utils/tracking/page-metadata-helpers";

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
   * CSP nonce for Content Security Policy compliance
   * Required in production to allow inline script execution
   */
  nonce?: string;
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
  nonce,
  dataProcessingOptions,
  dataProcessingCountry,
  dataProcessingState,
}: FacebookPixelProps) {
  const pathname = usePathname();
  const [isInitialized, setIsInitialized] = useState(pixelInitialized); // Initialize from global state
  const hasTrackedInitialPageView = React.useRef(false); // Track if we've sent initial PageView
  const scriptLoadedRef = React.useRef(false); // Track if script has been loaded
  const scriptInjectedRef = useRef(false); // Track if script has been injected to prevent duplicates

  // Store pixel ID globally for use in tracking functions
  globalPixelId = pixelId;

  // Note: We don't use useUserContext here because FacebookPixel is rendered before UserProvider
  // User type will default to "guest" for PageView events in this component
  // Other components (ProductViewTracking, etc.) that have access to UserProvider will pass correct user_type

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
      // Extract page metadata and build custom parameters
      const pageMetadata = extractPageMetadata(pathname, window.location.href);
      // Default to "guest" since UserProvider is not available at this level
      // User type will be correctly determined in components that have context access
      const currentUserType = "guest";

      const pageViewParams = {
        page_type: pageMetadata.page_type,
        page_name: pageMetadata.page_name,
        page_url: pageMetadata.page_url,
        user_type: currentUserType,
        platform: "tools-australia-website",
      };

      window.fbq("track", "PageView", pageViewParams);
      if (process.env.NODE_ENV === "development") {
        console.log("✅ Facebook Pixel: PageView tracked on route change", pageViewParams);
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
          // Extract page metadata and build custom parameters
          const pageMetadata = extractPageMetadata(pathname, window.location.href);
          // Default to "guest" since UserProvider is not available at this level
          const currentUserType = "guest";

          const pageViewParams = {
            page_type: pageMetadata.page_type,
            page_name: pageMetadata.page_name,
            page_url: pageMetadata.page_url,
            user_type: currentUserType,
            platform: "tools-australia-website",
          };

          window.fbq("track", "PageView", pageViewParams);
          hasTrackedInitialPageView.current = true;
          if (process.env.NODE_ENV === "development") {
            console.log("✅ Facebook Pixel: PageView verified/triggered (fallback)", pageViewParams);
          }
        } catch (error) {
          if (process.env.NODE_ENV === "development") {
            console.warn("⚠️ Facebook Pixel: Could not verify PageView", error);
          }
        }
      }
    }, 2000);

    return () => clearTimeout(verifyPageView);
  }, [isInitialized, pathname]);

  // Inject script with nonce support (replaces Next.js Script component for CSP compliance)
  // Moved before early returns to satisfy React Hooks rules
  useEffect(() => {
    // Only inject in browser environment
    if (typeof window === "undefined") {
      return;
    }

    // Don't inject if disabled, no pixel ID, already initialized, or already injected
    if (disabled || !pixelId || pixelInitialized || scriptInjectedRef.current) {
      return;
    }

    // Check if script already exists in DOM
    const existingScript = document.getElementById("facebook-pixel-script");
    if (existingScript) {
      scriptInjectedRef.current = true;
      return;
    }

    try {
      // Create script element with inline Facebook Pixel code
      const script = document.createElement("script");
      script.id = "facebook-pixel-script";
      script.async = true;

      // Add nonce attribute if provided (required for CSP compliance in production)
      if (nonce) {
        script.setAttribute("nonce", nonce);
      }

      // Set inline script content
      script.innerHTML = `
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
          // Track initial PageView with basic parameters (full parameters added on route changes)
          const initialPageUrl = typeof window !== 'undefined' ? window.location.href : '';
          const initialPathname = typeof window !== 'undefined' ? window.location.pathname : '';
          const pageType = initialPathname === '/' ? 'home' : initialPathname.split('/').filter(Boolean)[0] || 'unknown';
          window.fbq('track', 'PageView', {
            page_type: pageType,
            page_url: initialPageUrl,
            platform: 'tools-australia-website'
          });
        }
      `;

      // Append script to document head
      document.head.appendChild(script);
      scriptInjectedRef.current = true;

      if (process.env.NODE_ENV === "development") {
        console.log("✅ Facebook Pixel script injected with nonce:", nonce ? "yes" : "no");
      }

      // Mark script as loaded and check when pixel is ready
      scriptLoadedRef.current = true;

      // Wait for fbevents.js to load, then mark as initialized
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
    } catch (error) {
      // Handle script injection errors gracefully
      if (process.env.NODE_ENV === "development") {
        console.error("❌ Facebook Pixel: Error injecting script:", error);
      }
    }
  }, [pixelId, disabled, nonce, dataProcessingOptions, dataProcessingCountry, dataProcessingState]);

  // Don't load if disabled or no pixel ID
  if (disabled || !pixelId) {
    return null;
  }

  // If pixel is already initialized globally, don't render anything
  if (pixelInitialized && scriptLoadedRef.current) {
    return null; // Don't render script again
  }

  return (
    <>
      {/* Noscript fallback for users with JavaScript disabled */}
      {/* Using img instead of Image component as this is a 1x1 tracking pixel that should not be optimized */}
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

/**
 * Track button click event with custom parameters
 * Useful for tracking user interactions with buttons throughout the application
 *
 * @param params - Button click parameters including buttonName, buttonLocation, actionType, and optional tracking data
 *
 * @example
 * trackButtonClick({
 *   buttonName: "Purchase",
 *   buttonLocation: "product-page",
 *   actionType: "purchase",
 *   value: 99.99,
 *   currency: "AUD",
 *   productId: "product-123"
 * });
 */
export const trackButtonClick = (params: {
  buttonName: string;
  buttonLocation: string;
  actionType: string;
  pageUrl?: string;
  pageType?: string;
  value?: number;
  currency?: string;
  productId?: string;
  user_type?: "guest" | "member";
  platform?: string;
  [key: string]: unknown;
}) => {
  // Build parameters with defaults
  const buttonParams: Record<string, unknown> = {
    button_name: params.buttonName,
    button_location: params.buttonLocation,
    action_type: params.actionType,
    platform: params.platform || "tools-australia-website",
    ...(params.pageUrl && { page_url: params.pageUrl }),
    ...(params.pageType && { page_type: params.pageType }),
    ...(params.value !== undefined && { value: params.value }),
    ...(params.currency && { currency: params.currency }),
    ...(params.productId && { product_id: params.productId }),
    ...(params.user_type && { user_type: params.user_type }),
  };

  // Add any additional custom parameters (excluding already handled ones)
  const excludedKeys = [
    "buttonName",
    "buttonLocation",
    "actionType",
    "pageUrl",
    "pageType",
    "value",
    "currency",
    "productId",
    "user_type",
    "platform",
  ];
  Object.keys(params).forEach((key) => {
    if (!excludedKeys.includes(key)) {
      buttonParams[key] = params[key];
    }
  });

  trackFacebookEvent("ButtonClick", buttonParams);
};
