"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { tiktokProvider } from "@/lib/tracking/providers/tiktok";
import { eventTimeNow } from "@/lib/tracking/canonical-event";

declare global {
  interface Window {
    ttq: {
      load: (pixelId: string, options?: Record<string, unknown>) => void;
      page: () => void;
      track: (eventName: string, parameters?: Record<string, unknown>, options?: { event_id?: string }) => void;
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

    // Load TikTok Pixel script only once
    if (typeof window !== "undefined" && !window.ttq) {
      const script = document.createElement("script");
      script.innerHTML = `
        !function (w, d, t) {
          w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(
        var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script")
        ;n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
        
          ttq.load('${pixelId}');
          ttq.page();
        }(window, document, 'ttq');
      `;
      document.head.appendChild(script);
    }

    // Track page view on route change (only if pixel is loaded)
    if (typeof window !== "undefined" && window.ttq) {
      window.ttq.page();
    }
  }, [pixelId, pathname, disabled]);

  return null;
}

// Helper functions for tracking TikTok events
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
