"use client";

/**
 * Mirror a Meta funnel event to the server CAPI via the canonical sendConversion path.
 *
 * Why this exists:
 * - The browser fires the Meta Pixel (ViewContent / AddToCart / InitiateCheckout /
 *   AddPaymentInfo / Lead) directly with a generated event_id.
 * - This helper POSTs the SAME event_id to `/api/tracking/conversion`, which calls
 *   `sendConversion(canonicalEvent, ctx)` — fans out CAPI to FB (today) plus TikTok
 *   and Snapchat when those provider `capiSend` stubs are implemented.
 * - Meta merges browser Pixel + server CAPI by matching `event_id`.
 *
 * Why funnel events need the mirror (per Meta CAPI docs):
 * - https://developers.facebook.com/docs/marketing-api/conversions-api/
 *   "We recommend implementing the Conversions API alongside the Meta Pixel"
 * - https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events/
 *   Dedup works for ALL standard events, not just Purchase.
 * - Browser-only signal loses ~10-30% to ad blockers + iOS ITP + Safari ETP.
 *
 * Fire-and-forget — never throws.
 */

/** Same-origin endpoint over the canonical `sendConversion` dispatcher. */
const MIRROR_ENDPOINT = "/api/tracking/conversion";

// Single source of truth lives in mirror-event-names.ts (no "use client") so the
// server route enforces the exact same allowlist this client helper promises.
// Type-only re-export — erased at compile time, no zod in the client chunk.
export type { MirrorEventName } from "./mirror-event-names";
import type { MirrorEventName } from "./mirror-event-names";

interface MirrorCustomData {
  contentIds?: string[];
  contentType?: string;
  contentName?: string;
  contentCategory?: string;
  numItems?: number;
  orderId?: string;
  packageType?: string;
  searchString?: string;
}

/**
 * Client-supplyable PII for CAPI. The server route `/api/tracking/conversion`
 * SHA-256-hashes these via `hashPII`; never hashed client-side. Excludes
 * fbc/fbp/IP/UA (server-derived) by design.
 */
export interface MirrorUserData {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  birthdate?: string;
  externalId?: string;
}

/** Drop undefined/null/empty-string so we never overwrite server/session data with blanks. */
export function stripEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== "") {
      out[k as keyof T] = v as T[keyof T];
    }
  }
  return out;
}

interface MirrorParams {
  eventName: MirrorEventName;
  /** MUST match the event_id passed to the browser Pixel's 4th-arg `{eventID}` so Meta dedupes. */
  eventId: string;
  value?: number;
  /** ISO 4217. Will be uppercased server-side. */
  currency?: string;
  customData?: MirrorCustomData;
  userData?: MirrorUserData;
  /** Defaults to `window.location.href` at fire time. */
  eventSourceUrl?: string;
}

/**
 * Generate a stable per-fire event_id. Browser pixel and CAPI use the same value
 * so Meta merges them. Prefer `crypto.randomUUID` (modern browsers, Node 18+).
 */
export function generateMirrorEventId(eventName: MirrorEventName): string {
  const prefix = eventName.toLowerCase();
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * POST the canonical event payload to the server. The endpoint enriches with the
 * authenticated session's PII (email/phone/firstName/lastName/state/country/
 * birthdate/externalId) and request context (fbc/fbp/IP/UA), then dispatches via
 * `sendConversion(...)` — so this same call simultaneously primes the FB CAPI
 * mirror today and TikTok / Snap CAPI when their providers land.
 *
 * Never throws. Skips on non-browser execution.
 */
export function mirrorMetaEventToCapi(params: MirrorParams): void {
  if (typeof window === "undefined") return;

  const eventSourceUrl = params.eventSourceUrl ?? window.location.href;

  const cleanedUserData = params.userData
    ? stripEmpty(params.userData as Record<string, unknown>)
    : undefined;

  const body = {
    eventName: params.eventName,
    eventId: params.eventId,
    ...(params.value !== undefined && { value: params.value }),
    ...(params.currency && { currency: params.currency }),
    ...(params.customData && { customData: params.customData }),
    ...(cleanedUserData && Object.keys(cleanedUserData).length > 0 && { userData: cleanedUserData }),
    eventSourceUrl,
  };

  fetch(MIRROR_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // keepalive lets the request survive a navigation right after the event fires
    // (e.g. AddToCart immediately followed by router.push to /checkout).
    keepalive: true,
    body: JSON.stringify(body),
  }).catch((err) => {
    if (process.env.NODE_ENV === "development") {
      console.warn(`[Meta CAPI mirror] ${params.eventName} failed:`, err);
    }
  });
}
