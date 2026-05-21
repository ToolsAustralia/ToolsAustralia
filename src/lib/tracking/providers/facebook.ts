// Isomorphic: imported by both server (dispatch.ts → Stripe webhook) and browser
// (ConversionPixels.tsx). Do NOT add "use client" — that turns this module into a
// client-reference proxy when bundled into server code, and the proxy's `.enabled`
// becomes a Reference object instead of a function, blowing up dispatch.ts with
// "r.enabled is not a function" at request time. loadPixel/pixelTrack already
// guard with `typeof window` so they're safe to ship in the server bundle.

import type { CanonicalEvent, ConversionProvider, RequestContext } from "../types";
import { hashPII } from "../canonical-event";
import { getAllowedHostnames } from "../hostname-gate";
import {
  sendFacebookEvent,
  type FacebookEvent,
} from "@/lib/facebook";
import { toYYYYMMDD } from "@/utils/tracking/facebook-helpers";

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

  const script = document.createElement("script");
  script.id = "facebook-pixel-script";
  script.async = true;
  if (opts.nonce) script.setAttribute("nonce", opts.nonce);
  // Same inline init as the legacy FacebookPixel.tsx component. Kept verbatim
  // so behavior is unchanged after the facade swap.
  script.innerHTML = `
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    ${initCall}
    window.fbq('track', 'PageView');
    window._fbPixelInit = true;
  `;
  document.head.appendChild(script);
}

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
    ...(u.phone && { ph: hashPII(u.phone.replace(/\D/g, "")) }),
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
