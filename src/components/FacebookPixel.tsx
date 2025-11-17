"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

declare global {
  interface Window {
    fbq: (
      command: string,
      eventNameOrPixelId?: string,
      eventNameOrParams?: string | Record<string, unknown>,
      parameters?: Record<string, unknown>
    ) => void;
    _fbp?: string; // Facebook Browser ID cookie
  }
}

interface FacebookPixelProps {
  pixelId: string;
  disabled?: boolean;
}

// Store pixel ID globally for use in tracking functions
let globalPixelId: string | null = null;

export default function FacebookPixel({ pixelId, disabled = false }: FacebookPixelProps) {
  const pathname = usePathname();
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    // Don't load if disabled or no pixel ID
    if (disabled || !pixelId) return;

    // Store pixel ID globally
    globalPixelId = pixelId;

    // Load Facebook Pixel script only once
    if (typeof window !== "undefined" && !window.fbq) {
      const script = document.createElement("script");
      script.innerHTML = `
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window, document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '${pixelId}');
        fbq('track', 'PageView');
      `;
      document.head.appendChild(script);

      // Add noscript fallback
      const noscript = document.createElement("noscript");
      noscript.innerHTML = `<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1" />`;
      document.head.appendChild(noscript);

      setIsInitialized(true);
    } else if (typeof window !== "undefined" && typeof window.fbq === "function") {
      setIsInitialized(true);
    }

    // Track page view on route change (only if pixel is loaded)
    if (typeof window !== "undefined" && typeof window.fbq === "function" && isInitialized) {
      window.fbq("track", "PageView");
    }
  }, [pixelId, pathname, disabled, isInitialized]);

  return null;
}

/**
 * Track Facebook Pixel event with optional EventID for deduplication
 * Uses trackSingle when eventID is provided to enable deduplication with Conversions API
 *
 * @param eventName - Name of the event to track
 * @param parameters - Optional event parameters including eventID
 */
export const trackFacebookEvent = (eventName: string, parameters?: Record<string, unknown>) => {
  if (typeof window === "undefined" || !window.fbq) {
    console.warn("❌ Facebook Pixel: Not loaded or not available");
    return;
  }

  // Check if eventID is provided for deduplication
  const eventID = parameters?.eventID as string | undefined;

  // Remove eventID from parameters for trackSingle (it's passed in the event parameters)
  const eventParams = { ...parameters };
  if (eventParams.eventID) {
    // Keep eventID in params for trackSingle
  }

  try {
    if (eventID && globalPixelId) {
      // Use trackSingle for deduplication when eventID is provided
      // trackSingle signature: fbq('trackSingle', pixelId, eventName, parameters)
      console.log(`📘 Facebook Pixel: Sending ${eventName} with EventID: ${eventID}`, eventParams);
      window.fbq("trackSingle", globalPixelId, eventName, eventParams);
      console.log(`✅ Facebook Pixel: ${eventName} sent successfully with deduplication`);
    } else {
      // Use standard track for events without eventID
      // Remove eventID if present for standard track
      const standardParams = { ...eventParams };
      delete standardParams.eventID;
      console.log(`📘 Facebook Pixel: Sending ${eventName}`, standardParams);
      window.fbq("track", eventName, standardParams);
      console.log(`✅ Facebook Pixel: ${eventName} sent successfully`);
    }
  } catch (error) {
    console.error(`❌ Facebook Pixel: Error sending ${eventName}:`, error);
  }
};

export const trackPurchase = (value: number, currency: string = "USD", orderId?: string) => {
  trackFacebookEvent("Purchase", {
    value,
    currency,
    content_type: "product",
    ...(orderId && { order_id: orderId }),
  });
};

export const trackAddToCart = (value: number, currency: string = "USD", productId?: string) => {
  trackFacebookEvent("AddToCart", {
    value,
    currency,
    content_type: "product",
    ...(productId && { content_ids: [productId] }),
  });
};

export const trackInitiateCheckout = (value: number, currency: string = "USD", numItems?: number) => {
  trackFacebookEvent("InitiateCheckout", {
    value,
    currency,
    content_type: "product",
    ...(numItems && { num_items: numItems }),
  });
};

export const trackViewContent = (value: number, currency: string = "USD", productId?: string) => {
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

export const trackLead = (value?: number, currency: string = "USD") => {
  trackFacebookEvent("Lead", {
    content_type: "lead",
    ...(value && { value, currency }),
  });
};

export const trackSubscribe = (value?: number, currency: string = "USD") => {
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
  currency: string = "USD",
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
  currency: string = "USD",
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
