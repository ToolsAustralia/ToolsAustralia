// Isomorphic: imported by both server (dispatch.ts → Stripe webhook) and browser
// (ConversionPixels.tsx). Do NOT add "use client" — that turns this module into a
// client-reference proxy when bundled into server code, and the proxy's `.enabled`
// becomes a Reference object instead of a function, blowing up dispatch.ts with
// "r.enabled is not a function" at request time. loadPixel/pixelTrack already
// guard with `typeof window` so they're safe to ship in the server bundle.

import type { CanonicalEvent, ConversionProvider, RequestContext } from "../types";
import { hashPII } from "../canonical-event";
import { metaPhoneDigits } from "../advanced-matching";
import { getAllowedHostnames } from "../hostname-gate";
// `FacebookEvent` is a type (erased at build). `sendFacebookEvent` is the SERVER CAPI sender and
// transitively imports undici (node:net), so it must NOT be a *static* import here: this module is
// isomorphic (also bundled into the browser via the tracking registry / usePixelTracking), and a
// static import pulls undici into the EAGER client bundle, crashing every page at load with
// "Cannot find module 'node:net'". It is lazy-imported inside capiSend() (a server-only call path)
// so the undici chunk is never evaluated in the browser. See docs/tracking/gotchas.md.
import type { FacebookEvent } from "@/lib/facebook";
import { toYYYYMMDD } from "@/utils/tracking/facebook-helpers";
import { shouldTrackRoute, EXCLUDED_TRACKING_PREFIXES } from "@/utils/tracking/should-track-route";

/** Normalize country to ISO 3166-1 alpha-2 lowercase, or null if not a 2-letter code. */
function normalizeCountry(input: string | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

declare global {
  interface Window {
    fbq: (
      command: string,
      eventNameOrPixelId?: string,
      eventNameOrParams?: string | Record<string, unknown>,
      parameters?: Record<string, unknown>,
    ) => void;
    _fbPixelInit?: boolean;
  }
}

function envEnabled(): { pixel: boolean; capi: boolean } {
  const pixelId = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID;
  const accessToken = process.env.FACEBOOK_ACCESS_TOKEN;
  return {
    pixel: !!pixelId,
    capi: !!pixelId && !!accessToken,
  };
}

function loadPixel(opts: { nonce?: string; advancedMatching?: Record<string, string> }): void {
  if (typeof window === "undefined") return;
  if (window._fbPixelInit) return;
  const pixelId = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID;
  if (!pixelId) return;
  if (!getAllowedHostnames().includes(window.location.hostname)) return;

  // Render the init call. When advancedMatching is provided, fbq accepts it as
  // the second arg: fbq('init', pixelId, { em, ph, ... }). Mid-session login
  // re-init is handled separately by ConversionPixelsAdvancedMatching.
  const initCall = opts.advancedMatching
    ? `window.fbq('init', '${pixelId}', ${JSON.stringify(opts.advancedMatching)});`
    : `window.fbq('init', '${pixelId}');`;

  // Decide whether to fire the initial PageView based on the current route.
  // The decision is made at load-time (TS) so the inline script doesn't need
  // its own pathname-gating logic; this is safe because loadPixel runs once
  // per session on initial mount, when window.location.pathname is reliable.
  const fireInitialPageView = shouldTrackRoute(window.location.pathname);
  const pageViewLine = fireInitialPageView ? `window.fbq('track', 'PageView');` : "";

  const script = document.createElement("script");
  script.id = "facebook-pixel-script";
  script.async = true;
  if (opts.nonce) script.setAttribute("nonce", opts.nonce);

  // Inline init:
  //  1) `disablePushState = true` — stop Meta's HTML5 History State listener
  //     from auto-firing PageView on every Next.js SPA route change. Without
  //     this, the Pixel fires PageView on /admin, /my-account, etc., bypassing
  //     our ConversionPixels route-change gate because the auto-fire happens
  //     inside fbevents.js. Per Meta's SPA tagging guide:
  //     https://developers.facebook.com/ads/blog/post/2017/05/29/tagging-a-single-page-application-facebook-pixel/
  //  2) `set autoConfig false` — stops Meta from auto-firing
  //     SubscribedButtonClick / ButtonClick / FormSubmit / Microdata and from
  //     auto-scraping form inputs for advanced matching. We supply our own
  //     hashed advanced matching server-side via CAPI's user_data. MUST come
  //     BEFORE init. Per https://developers.facebook.com/docs/meta-pixel/advanced/
  //  3) Initial PageView is conditional on `shouldTrackRoute(pathname)` —
  //     skipped on excluded routes (admin / my-account / affiliate / etc.)
  script.innerHTML = `
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq.disablePushState = true;
    window.fbq('set', 'autoConfig', false, '${pixelId}');
    ${initCall}
    ${pageViewLine}
    window._fbPixelInit = true;
  `;
  document.head.appendChild(script);
}

// Re-export for inline-script consistency between modules.
export { EXCLUDED_TRACKING_PREFIXES };

function pixelTrack(event: CanonicalEvent): void {
  if (typeof window === "undefined" || !window.fbq) return;
  if (!getAllowedHostnames().includes(window.location.hostname)) return;

  const customData: Record<string, unknown> = {};
  if (event.value !== undefined) customData.value = event.value;
  if (event.currency) customData.currency = event.currency;
  if (event.customData?.orderId) customData.order_id = event.customData.orderId;
  if (event.customData?.contentIds) customData.content_ids = event.customData.contentIds;
  if (event.customData?.contentType) customData.content_type = event.customData.contentType;
  if (event.customData?.contentName) customData.content_name = event.customData.contentName;
  if (event.customData?.contentCategory) customData.content_category = event.customData.contentCategory;
  if (event.customData?.numItems !== undefined) customData.num_items = event.customData.numItems;
  if (event.customData?.packageType) customData.package_type = event.customData.packageType;
  if (event.customData?.searchString) customData.search_string = event.customData.searchString;
  if (event.providerData?.facebook) Object.assign(customData, event.providerData.facebook);

  // Meta 4-arg form: { eventID } in last param enables Pixel↔CAPI dedup.
  window.fbq("track", event.eventName, customData, { eventID: event.eventId });
}

async function capiSend(event: CanonicalEvent, ctx: RequestContext): Promise<boolean> {
  if (!envEnabled().capi) return false;

  const u = event.userData ?? {};
  const fbCustomFields = event.providerData?.facebook ?? {};

  const userData: FacebookEvent["user_data"] = {
    ...(u.email && { em: hashPII(u.email) }),
    // E.164 digits (61…) — MUST match buildAdvancedMatching so browser AM + CAPI hashes align.
    ...(u.phone && metaPhoneDigits(u.phone) && { ph: hashPII(metaPhoneDigits(u.phone)) }),
    ...(u.firstName && { fn: hashPII(u.firstName) }),
    ...(u.lastName && { ln: hashPII(u.lastName) }),
    ...(u.city && { ct: hashPII(u.city) }),
    ...(u.state && { st: hashPII(u.state) }),
    ...(u.zipCode && { zp: hashPII(u.zipCode) }),
    ...(normalizeCountry(u.country) && { country: hashPII(normalizeCountry(u.country)!) }),
    ...(u.externalId && { external_id: hashPII(u.externalId) }),
    ...((u.birthdate && toYYYYMMDD(u.birthdate)) && {
      db: hashPII(toYYYYMMDD(u.birthdate)!),
    }),
    ...(u.fbc && { fbc: u.fbc }),
    ...(u.fbp && { fbp: u.fbp }),
    ...((u.clientIpAddress ?? ctx.clientIpAddress) && {
      client_ip_address: u.clientIpAddress ?? ctx.clientIpAddress,
    }),
    ...((u.clientUserAgent ?? ctx.clientUserAgent) && {
      client_user_agent: u.clientUserAgent ?? ctx.clientUserAgent,
    }),
  };

  // Default to "website". Webhook-originated events (no live browser session) should
  // pass `actionSource: "system_generated"` via the canonical event so Meta's spec is
  // honored — `event_source_url` becomes optional for system_generated and we omit it
  // so we don't claim a stale URL is the source of a backend event.
  const actionSource: FacebookEvent["action_source"] = event.actionSource ?? "website";
  const resolvedEventSourceUrl = event.eventSourceUrl ?? ctx.eventSourceUrl;

  const fbEvent: FacebookEvent = {
    event_name: event.eventName,
    event_time: event.eventTime,
    event_id: event.eventId,
    action_source: actionSource,
    user_data: userData,
    custom_data: {
      ...(event.value !== undefined && { value: event.value }),
      ...(event.currency && { currency: event.currency }),
      ...(event.customData?.orderId && { order_id: event.customData.orderId }),
      ...(event.customData?.contentIds && { content_ids: event.customData.contentIds }),
      ...(event.customData?.contentType && { content_type: event.customData.contentType }),
      ...(event.customData?.contentName && { content_name: event.customData.contentName }),
      ...(event.customData?.contentCategory && { content_category: event.customData.contentCategory }),
      ...(event.customData?.numItems !== undefined && { num_items: event.customData.numItems }),
      ...(event.customData?.packageType && { package_type: event.customData.packageType }),
      ...(event.customData?.searchString && { search_string: event.customData.searchString }),
      ...fbCustomFields,
    },
    // Only include event_source_url for website events — Meta's spec makes it
    // required for "website" but expects it omitted for "system_generated".
    ...(actionSource === "website" && resolvedEventSourceUrl && { event_source_url: resolvedEventSourceUrl }),
  };

  // Lazy-load the server-only CAPI sender so undici (node:net) stays OUT of the eager client
  // bundle. capiSend only ever runs server-side, so this dynamic import is never evaluated in the
  // browser; on the server it resolves normally on first call.
  const { sendFacebookEvent } = await import("@/lib/facebook");
  return sendFacebookEvent(fbEvent);
}

/**
 * Facebook provider — Pixel + Conversions API.
 *
 * `event.providerData.facebook` is spread into `custom_data` on the CAPI
 * payload for Facebook-specific fields that don't have a canonical slot.
 * Raw PII should always be sent via `event.userData` so it's hashed and
 * placed on `user_data` (preserving Event Match Quality and fbc/fbp-based
 * Pixel↔CAPI dedup).
 */
export const facebookProvider: ConversionProvider = {
  id: "facebook",
  enabled: envEnabled,
  productionHostnames: getAllowedHostnames,
  loadPixel,
  pixelTrack,
  capiSend,
};
