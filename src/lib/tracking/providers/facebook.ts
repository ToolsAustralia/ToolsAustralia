"use client";
// ^ "use client" is OK here — the module is consumed by both server and browser code;
// loadPixel/pixelTrack are no-ops on the server because they check `typeof window`.

import type { CanonicalEvent, ConversionProvider, RequestContext } from "../types";
import { hashPII } from "../canonical-event";
import { getAllowedHostnames } from "../hostname-gate";
import {
  sendFacebookEvent,
  type FacebookEvent,
} from "@/lib/facebook";

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

function loadPixel(opts: { nonce?: string }): void {
  if (typeof window === "undefined") return;
  if (window._fbPixelInit) return;
  const pixelId = process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID;
  if (!pixelId) return;
  if (!getAllowedHostnames().includes(window.location.hostname)) return;

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
    window.fbq('init', '${pixelId}');
    window.fbq('track', 'PageView');
    window._fbPixelInit = true;
  `;
  document.head.appendChild(script);
}

function pixelTrack(event: CanonicalEvent): void {
  // DEBUG TEMPORARY — remove after diagnosing missing Purchase pixel on staging
  console.log("[DEBUG fb.pixelTrack] entered", {
    eventName: event.eventName,
    eventId: event.eventId,
    hostname: typeof window !== "undefined" ? window.location.hostname : "no-window",
    fbqType: typeof window !== "undefined" ? typeof window.fbq : "no-window",
    fbqLoaded: typeof window !== "undefined" && window.fbq ? (window.fbq as { loaded?: boolean }).loaded : "no-fbq",
    allowedHostnames: getAllowedHostnames(),
  });

  if (typeof window === "undefined" || !window.fbq) {
    console.warn("[DEBUG fb.pixelTrack] BLOCKED: no window or no fbq");
    return;
  }
  if (!getAllowedHostnames().includes(window.location.hostname)) {
    console.warn("[DEBUG fb.pixelTrack] BLOCKED: hostname not in allowlist", {
      hostname: window.location.hostname,
      allowed: getAllowedHostnames(),
    });
    return;
  }

  const customData: Record<string, unknown> = {};
  if (event.value !== undefined) customData.value = event.value;
  if (event.currency) customData.currency = event.currency;
  if (event.customData?.orderId) customData.order_id = event.customData.orderId;
  if (event.customData?.contentIds) customData.content_ids = event.customData.contentIds;
  if (event.customData?.contentType) customData.content_type = event.customData.contentType;
  if (event.customData?.contentName) customData.content_name = event.customData.contentName;
  if (event.customData?.contentCategory) customData.content_category = event.customData.contentCategory;
  if (event.customData?.numItems !== undefined) customData.num_items = event.customData.numItems;
  if (event.customData?.searchString) customData.search_string = event.customData.searchString;
  if (event.providerData?.facebook) Object.assign(customData, event.providerData.facebook);

  console.log("[DEBUG fb.pixelTrack] about to call fbq", {
    eventName: event.eventName,
    customData,
    eventID: event.eventId,
  });

  // Meta 4-arg form: { eventID } in last param enables Pixel↔CAPI dedup.
  try {
    window.fbq("track", event.eventName, customData, { eventID: event.eventId });
    console.log("[DEBUG fb.pixelTrack] fbq call returned without throwing");
  } catch (err) {
    console.error("[DEBUG fb.pixelTrack] fbq threw", err);
  }
}

async function capiSend(event: CanonicalEvent, ctx: RequestContext): Promise<boolean> {
  if (!envEnabled().capi) return false;

  const u = event.userData ?? {};
  // Extract _legacyUserData escape hatch — pre-hashed Meta-format user_data from the
  // legacy /api/facebook/track shim. These fields take precedence over `event.userData`
  // (which the legacy shim doesn't populate) and must land on `user_data`, NOT `custom_data`,
  // so fbc/fbp/em-based Pixel↔CAPI dedup and Event Match Quality keep working.
  const fbProviderData = event.providerData?.facebook ?? {};
  const legacyUserData =
    (fbProviderData._legacyUserData as Record<string, string> | undefined) ?? {};
  const fbCustomFields = Object.fromEntries(
    Object.entries(fbProviderData).filter(([k]) => k !== "_legacyUserData"),
  );

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
    ...(u.fbc && { fbc: u.fbc }),
    ...(u.fbp && { fbp: u.fbp }),
    ...((u.clientIpAddress ?? ctx.clientIpAddress) && {
      client_ip_address: u.clientIpAddress ?? ctx.clientIpAddress,
    }),
    ...((u.clientUserAgent ?? ctx.clientUserAgent) && {
      client_user_agent: u.clientUserAgent ?? ctx.clientUserAgent,
    }),
    // Legacy pre-hashed user_data wins (legacy callers don't populate event.userData).
    ...legacyUserData,
  };

  const fbEvent: FacebookEvent = {
    event_name: event.eventName,
    event_time: event.eventTime,
    event_id: event.eventId,
    action_source: "website",
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
    event_source_url: event.eventSourceUrl ?? ctx.eventSourceUrl,
  };

  return sendFacebookEvent(fbEvent);
}

/**
 * Facebook provider — Pixel + Conversions API.
 *
 * Provider-specific escape hatch: `event.providerData.facebook` is spread into
 * `custom_data` on the CAPI payload, EXCEPT for the reserved `_legacyUserData`
 * key. `_legacyUserData` is treated as pre-hashed Meta-format `user_data`
 * (em/ph/fn/ln/ct/st/zp/country/external_id/fbc/fbp/...) and merged into
 * `user_data` with legacy values winning over anything hashed from
 * `event.userData`. This is how the legacy `/api/facebook/track` shim passes
 * already-hashed PII through the canonical pipeline without re-hashing or
 * leaking PII into `custom_data` (which would tank Event Match Quality and
 * break fbc/fbp-based Pixel↔CAPI dedup). New callers should send raw PII via
 * `event.userData` through `/api/tracking/conversion` instead.
 */
export const facebookProvider: ConversionProvider = {
  id: "facebook",
  enabled: envEnabled,
  productionHostnames: getAllowedHostnames,
  loadPixel,
  pixelTrack,
  capiSend,
};
