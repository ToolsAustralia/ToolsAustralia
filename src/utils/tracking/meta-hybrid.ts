"use client";

/**
 * Meta hybrid event firing — single helper that fires the browser Pixel
 * (4-arg fbq with dedup eventID) AND mirrors the same event to the server
 * Conversions API endpoint. Both sides use the SAME event_id, so Meta merges
 * them in Events Manager.
 *
 * This is THE pattern for every standard Meta event that benefits from CAPI
 * recovery of ad-blocker / Safari ITP / iOS opt-out signal loss. TikTok and
 * Snapchat integrations should follow the same shape (one shared ID, browser
 * pixel + server CAPI fire in lockstep).
 *
 * Architecture:
 *   1. Browser fires `fbq('track', name, customData, { eventID })`
 *   2. Server endpoint `/api/facebook/track` receives a thin payload
 *      (event_name, event_id, custom_data) and enriches it with the
 *      authenticated user's hashed PII + request context (fbc, fbp, IP, UA).
 *   3. Meta deduplicates by `event_name + event_id` per the dedup spec:
 *      https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events/
 */

import { trackFacebookEvent } from "@/components/FacebookPixel";

/** Same-origin endpoint that mirrors a browser event to Meta CAPI server-side. */
const META_CAPI_ENDPOINT = "/api/facebook/track";

/**
 * Standard Meta events supported by the hybrid path. Restricted to events that
 * benefit from server-side mirroring — `PageView` is excluded because the
 * per-route CAPI hit isn't worth the load for low-signal page-view events.
 */
export type HybridEventName =
  | "ViewContent"
  | "AddToCart"
  | "InitiateCheckout"
  | "AddPaymentInfo"
  | "Lead"
  | "Search";

export interface MetaHybridFireParams {
  eventName: HybridEventName;
  /**
   * Free-form custom_data payload. Common fields: `value`, `currency`,
   * `content_ids`, `content_type`, `content_name`, `num_items`. The same
   * object is sent to both Pixel and CAPI so they match on Meta's side.
   */
  customData?: Record<string, unknown>;
  /**
   * Stable per-event identifier. Used as the Pixel `eventID` (4th-arg) AND
   * the CAPI `event_id`. If omitted, a UUID-based ID is generated — only
   * pass an explicit ID if the same logical event might fire twice from
   * different code paths and you want them merged (e.g. retry, fallback).
   */
  eventId?: string;
  /**
   * Optional override for `event_source_url`. Defaults to the current
   * `window.location.href` on the browser side; server adds the Referer
   * header if not provided.
   */
  eventSourceUrl?: string;
}

/**
 * Generate a stable per-event ID. Uses `crypto.randomUUID()` where available
 * (modern browsers, Node 18+), with a timestamp-suffixed fallback for older
 * environments. The prefix makes events easier to identify in Events Manager.
 */
function generateHybridEventId(eventName: HybridEventName): string {
  const prefix = eventName.toLowerCase();
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Fire a Meta event via both browser Pixel and server CAPI with a shared event_id.
 * Non-blocking — the server fetch is fire-and-forget and never throws.
 *
 * @returns The event_id that was used (useful for logging / correlation).
 */
export function fireMetaHybridEvent(params: MetaHybridFireParams): string {
  const eventId = params.eventId ?? generateHybridEventId(params.eventName);
  const customData = params.customData ?? {};

  // 1. Browser Pixel — trackFacebookEvent (after Phase 2) handles the 4-arg fbq
  // form when eventID is present, so this participates in Meta's dedup.
  trackFacebookEvent(params.eventName, { ...customData, eventID: eventId });

  // 2. Server CAPI mirror — fire-and-forget; the server enriches user_data
  // from the authenticated session and the request context.
  if (typeof window !== "undefined") {
    const eventSourceUrl = params.eventSourceUrl ?? window.location.href;
    fetch(META_CAPI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // keepalive lets the request survive navigation away from the page,
      // important for events fired right before a route change (e.g. AddToCart
      // followed by /checkout navigation).
      keepalive: true,
      body: JSON.stringify({
        event_name: params.eventName,
        event_id: eventId,
        custom_data: customData,
        event_source_url: eventSourceUrl,
      }),
    }).catch((err) => {
      if (process.env.NODE_ENV === "development") {
        console.warn(`[Meta CAPI mirror] ${params.eventName} failed:`, err);
      }
    });
  }

  return eventId;
}
