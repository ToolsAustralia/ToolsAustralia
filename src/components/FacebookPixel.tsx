"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

declare global {
  interface Window {
    fbq: (command: string, eventName: string, parameters?: Record<string, unknown>) => void;
  }
}

interface FacebookPixelProps {
  pixelId: string;
  disabled?: boolean;
}

export default function FacebookPixel({ pixelId, disabled = false }: FacebookPixelProps) {
  const pathname = usePathname();

  useEffect(() => {
    // Don't load if disabled or no pixel ID
    if (disabled || !pixelId) return;

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
    }

    // Track page view on route change (only if pixel is loaded)
    if (typeof window !== "undefined" && window.fbq) {
      window.fbq("track", "PageView");
    }
  }, [pixelId, pathname, disabled]);

  return null;
}

// Helper functions for tracking events
export const trackFacebookEvent = (eventName: string, parameters?: Record<string, unknown>) => {
  if (typeof window !== "undefined" && window.fbq) {
    console.log(`📘 Facebook Pixel: Sending ${eventName}`, parameters);
    window.fbq("track", eventName, parameters);
    console.log(`✅ Facebook Pixel: ${eventName} sent successfully`);
  } else {
    console.warn("❌ Facebook Pixel: Not loaded or not available");
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
