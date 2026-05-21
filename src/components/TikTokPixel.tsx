"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { shouldTrackRoute, EXCLUDED_TRACKING_PREFIXES } from "@/utils/tracking/should-track-route";

declare global {
  interface Window {
    ttq: {
      load: (pixelId: string, options?: Record<string, unknown>) => void;
      page: () => void;
      track: (eventName: string, parameters?: Record<string, unknown>) => void;
      identify: (user: Record<string, unknown>) => void;
      instances: (pixelId: string) => Record<string, unknown>;
      debug: (enable: boolean) => void;
      on: (event: string, callback: (...args: unknown[]) => void) => void;
      off: (event: string, callback: (...args: unknown[]) => void) => void;
      once: (event: string, callback: (...args: unknown[]) => void) => void;
      ready: (callback: () => void) => void;
      alias: (userId: string) => void;
      group: (groupId: string, traits?: Record<string, unknown>) => void;
      enableCookie: () => void;
      disableCookie: () => void;
      holdConsent: () => void;
      revokeConsent: () => void;
      grantConsent: () => void;
    };
  }
}

interface TikTokPixelProps {
  pixelId: string;
  disabled?: boolean;
}

export default function TikTokPixel({ pixelId, disabled = false }: TikTokPixelProps) {
  const pathname = usePathname();

  useEffect(() => {
    // Don't load if disabled or no pixel ID
    if (disabled || !pixelId) return;

    // Load TikTok Pixel script only once. Initial ttq.page() inside the script is
    // gated against internal/staff routes (keep in sync with should-track-route.ts).
    if (typeof window !== "undefined" && !window.ttq) {
      const excludedPrefixesJson = JSON.stringify([...EXCLUDED_TRACKING_PREFIXES]);
      const script = document.createElement("script");
      script.innerHTML = `
        !function (w, d, t) {
          w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(
        var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script")
        ;n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};

          ttq.load('${pixelId}');
          var _ttExcluded = ${excludedPrefixesJson};
          var _ttPath = window.location.pathname;
          var _ttSkip = _ttExcluded.some(function(p){ return _ttPath === p || _ttPath.indexOf(p + '/') === 0; });
          if (!_ttSkip) { ttq.page(); }
        }(window, document, 'ttq');
      `;
      document.head.appendChild(script);
    }

    // Track page view on route change (only if pixel is loaded and route is trackable)
    if (typeof window !== "undefined" && window.ttq && shouldTrackRoute(pathname)) {
      window.ttq.page();
    }
  }, [pixelId, pathname, disabled]);

  return null;
}

// Helper functions for tracking TikTok events.
//
// TikTok's Pixel + Events API dedup uses `event_id` (snake_case) per
// https://ads.tiktok.com/help/article/event-deduplication — our internal callers
// pass `eventID` (camelCase, matching Meta's CAPI naming). Normalise here so a
// single conversion ID can flow unchanged through Meta Pixel + Meta CAPI + TikTok
// Pixel + (future) TikTok Events API.
export const trackTikTokEvent = (eventName: string, parameters?: Record<string, unknown>) => {
  if (typeof window === "undefined" || !window.ttq) {
    return;
  }
  let payload = parameters;
  if (parameters && parameters.eventID !== undefined) {
    const { eventID, ...rest } = parameters;
    payload = { ...rest, event_id: eventID };
  }
  try {
    window.ttq.track(eventName, payload);
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn(`TikTok Pixel: ${eventName} send error`, err);
    }
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
