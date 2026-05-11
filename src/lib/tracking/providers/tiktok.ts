// src/lib/tracking/providers/tiktok.ts
"use client";

import type { CanonicalEvent, ConversionProvider } from "../types";
import { getAllowedHostnames } from "../hostname-gate";

// NOTE: The legacy `src/components/TikTokPixel.tsx` also augments `Window.ttq`. Both
// declarations must match exactly (TS2687/TS2717) until that component becomes a
// facade in Task 14. We mirror the legacy shape here and add the optional `event_id`
// 3rd arg to `track`, which TikTok's pixel SDK supports for browser↔CAPI dedup.
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
    _ttqInit?: boolean;
  }
}

function envEnabled(): { pixel: boolean; capi: boolean } {
  return {
    pixel: !!process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID,
    capi: !!process.env.TIKTOK_ACCESS_TOKEN,
  };
}

function loadPixel(opts: { nonce?: string }): void {
  if (typeof window === "undefined") return;
  if (window._ttqInit) return;
  const pixelId = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;
  if (!pixelId) return; // No-op when not configured. No script tag, no console noise.
  if (!getAllowedHostnames().includes(window.location.hostname)) return;

  // Inline init copied verbatim from legacy TikTokPixel.tsx so behavior is unchanged.
  const script = document.createElement("script");
  if (opts.nonce) script.setAttribute("nonce", opts.nonce);
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
  window._ttqInit = true;
}

function pixelTrack(event: CanonicalEvent): void {
  if (typeof window === "undefined" || !window.ttq) return;
  if (!getAllowedHostnames().includes(window.location.hostname)) return;
  if (!process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID) return;

  const params: Record<string, unknown> = {};
  if (event.value !== undefined) params.value = event.value;
  if (event.currency) params.currency = event.currency;
  if (event.customData?.contentIds) params.content_id = event.customData.contentIds[0];
  if (event.customData?.contentType) params.content_type = event.customData.contentType;
  if (event.customData?.contentName) params.content_name = event.customData.contentName;
  if (event.customData?.numItems !== undefined) params.quantity = event.customData.numItems;
  if (event.customData?.orderId) params.order_id = event.customData.orderId;
  if (event.providerData?.tiktok) Object.assign(params, event.providerData.tiktok);

  // TikTok dedup: 3rd arg `{ event_id }` matches Events API event_id (spec §3 invariant #1).
  window.ttq.track(event.eventName, params, { event_id: event.eventId });
}

async function capiSend(_event: CanonicalEvent): Promise<boolean> {
  // STUB. Real TikTok Events API integration lands in follow-up spec.
  // Returning false here is the documented behavior — callers expect a boolean result map,
  // and false on a stub is indistinguishable from "credentials missing", which is the right
  // semantics for code consumers downstream.
  return false;
}

export const tiktokProvider: ConversionProvider = {
  id: "tiktok",
  enabled: envEnabled,
  productionHostnames: getAllowedHostnames,
  loadPixel,
  pixelTrack,
  capiSend,
};
