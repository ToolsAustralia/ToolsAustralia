// src/lib/tiktok.ts
// Canonical TikTok Events API (v1.3) sender. Parallel to src/lib/facebook.ts.
// Endpoint: POST https://business-api.tiktok.com/open_api/v1.3/event/track/
// Auth: header `Access-Token`. Success: HTTP 200 AND body `code === 0`.
// Verified 2026-05-22 against working code from Stape/mParticle/Adobe/Benly + TikTok
// help center — see docs/superpowers/specs/2026-05-22-tiktok-events-api-design.md §2/§2a.

import { hashPII } from "./tracking/canonical-event";
import { resilientFetch, describeFetchError } from "./http/outbound";
import { getPixelEnv, isProductionPixelEnv } from "./facebook-env";
import { normalizePhoneE164 } from "@/utils/tracking/tiktok-helpers";
import type { CanonicalEvent, RequestContext } from "./tracking/types";

// Re-export the shared phone normalizer so existing imports from `@/lib/tiktok`
// (the unit test, the provider) keep working. The canonical definition lives in
// tiktok-helpers.ts because it must be client-bundle-safe (no `crypto`) for the
// browser `ttq.identify` call to use the IDENTICAL normalization (dedup-safe).
export { normalizePhoneE164 };

const TIKTOK_EVENTS_API_URL =
  "https://business-api.tiktok.com/open_api/v1.3/event/track/";

/** Per-event object in the v1.3 `data[]` array. */
export interface TikTokEvent {
  event: string;
  event_time: number; // Unix SECONDS
  event_id: string;
  user: {
    email?: string; // sha256(lowercase+trim)
    /**
     * sha256(E.164). The field is `phone` — NOT `phone_number`.
     *
     * `phone_number` is the **v1.2** name AND the browser pixel's
     * `ttq.identify({ phone_number })` name, so it looks right from both sides. v1.3
     * silently IGNORES unknown user keys — no error, no Diagnostics warning — so the
     * whole parameter just vanished. It surfaced only in Events Manager → EMQ, where
     * CompleteRegistration (our one Events-API-ONLY event, and one that REQUIRES a
     * mobile at signup) sat at 0% phone coverage while Purchase/AddPaymentInfo — which
     * also fire from the browser pixel — showed 74%/91% off `ttq.identify` alone.
     *
     * Confirmed against Segment's production v1.3 destination (`TTUser.phone`).
     * Do not "correct" this back to match the pixel: the two APIs genuinely differ.
     */
    phone?: string;
    external_id?: string; // sha256(lowercase+trim)
    first_name?: string; // sha256(lowercase, ALL whitespace stripped)
    last_name?: string; // sha256(lowercase, ALL whitespace stripped)
    zip_code?: string; // sha256(lowercase, ALL whitespace stripped)
    city?: string; // RAW plaintext — lowercase, alphanumerics only (NOT hashed)
    state?: string; // RAW plaintext — lowercase, alphanumerics only (NOT hashed)
    country?: string; // RAW plaintext — ISO 3166-1 alpha-2, lowercased (NOT hashed)
    ttclid?: string; // raw
    ttp?: string; // raw (_ttp cookie)
    ip?: string; // raw
    user_agent?: string; // raw
  };
  properties: {
    value?: number;
    currency?: string;
    content_type?: string;
    order_id?: string;
    contents?: Array<{
      content_id?: string;
      content_type?: string;
      content_name?: string;
      quantity?: number;
      price?: number;
    }>;
    query?: string;
  };
  page?: { url?: string; referrer?: string };
}

export interface TikTokRequestBody {
  event_source: "web";
  event_source_id: string;
  test_event_code?: string;
  data: TikTokEvent[];
}

/**
 * Hash a name / postcode the way v1.3 expects: strip ALL whitespace, lowercase, SHA-256.
 * (`hashPII` lowercases + trims, so stripping whitespace first covers the rest — "Mc Donald"
 * and "McDonald" must land on the same hash.) Returns undefined for whitespace-only input
 * so we never send a hash of "".
 */
function hashCollapsed(value: string): string | undefined {
  const collapsed = value.replace(/\s/g, "");
  return collapsed ? hashPII(collapsed) : undefined;
}

/**
 * Normalize city / state / country: lowercase, alphanumerics only, **sent as PLAINTEXT**.
 * These are the only identity fields v1.3 does NOT hash — hashing them breaks matching just
 * as silently as a wrong field name does, so keep them out of `hashPII`'s path.
 */
function normalizeGeo(value: string): string | undefined {
  const normalized = value.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  return normalized || undefined;
}

/** Map a provider-agnostic CanonicalEvent to a TikTok per-event object. Pure. */
export function mapCanonicalToTikTokEvent(
  event: CanonicalEvent,
  ctx: RequestContext,
): TikTokEvent {
  const u = event.userData ?? {};
  const cd = event.customData ?? {};

  // Normalize phone once (pure fn) — reused for the presence guard and the hash.
  const phoneE164 = u.phone ? normalizePhoneE164(u.phone) : "";

  // Name / geo / postcode: v1.3 accepts all of these and every caller already collects
  // them for the Meta CAPI event, so omitting them was leaving free match quality behind.
  // Note the split: names + zip are HASHED, city/state/country are PLAINTEXT.
  const firstName = u.firstName ? hashCollapsed(u.firstName) : undefined;
  const lastName = u.lastName ? hashCollapsed(u.lastName) : undefined;
  const zipCode = u.zipCode ? hashCollapsed(u.zipCode) : undefined;
  const city = u.city ? normalizeGeo(u.city) : undefined;
  const state = u.state ? normalizeGeo(u.state) : undefined;
  const country = u.country ? normalizeGeo(u.country) : undefined;

  const user: TikTokEvent["user"] = {
    ...(u.email && { email: hashPII(u.email) }),
    ...(phoneE164 && { phone: hashPII(phoneE164) }),
    ...(u.externalId && { external_id: hashPII(u.externalId) }),
    ...(firstName && { first_name: firstName }),
    ...(lastName && { last_name: lastName }),
    ...(zipCode && { zip_code: zipCode }),
    ...(city && { city }),
    ...(state && { state }),
    ...(country && { country }),
    ...(u.ttclid && { ttclid: u.ttclid }),
    ...(u.ttp && { ttp: u.ttp }),
    ...((u.clientIpAddress ?? ctx.clientIpAddress) && {
      ip: u.clientIpAddress ?? ctx.clientIpAddress,
    }),
    ...((u.clientUserAgent ?? ctx.clientUserAgent) && {
      user_agent: u.clientUserAgent ?? ctx.clientUserAgent,
    }),
  };

  // `numItems` is the order-wide item count, not per-row. Only attach it as a row
  // `quantity` when there's a SINGLE content id (the only shape callers send today).
  // For multi-line carts we'd need per-item quantities, so we omit it rather than
  // stamp the order total onto every row and inflate reporting.
  const ids = cd.contentIds;
  const contents =
    ids && ids.length > 0
      ? ids.map((id) => ({
          content_id: id,
          ...(cd.contentType && { content_type: cd.contentType }),
          ...(cd.contentName && { content_name: cd.contentName }),
          ...(cd.numItems !== undefined && ids.length === 1 && { quantity: cd.numItems }),
        }))
      : undefined;

  const properties: TikTokEvent["properties"] = {
    ...(event.value !== undefined && { value: event.value }),
    ...(event.currency && { currency: event.currency }),
    ...(cd.contentType && { content_type: cd.contentType }),
    ...(cd.orderId && { order_id: cd.orderId }),
    ...(contents && { contents }),
    ...(cd.searchString && { query: cd.searchString }),
  };

  const pageUrl = event.eventSourceUrl ?? ctx.eventSourceUrl;

  return {
    event: event.eventName,
    event_time: event.eventTime,
    event_id: event.eventId,
    user,
    properties,
    ...(pageUrl && { page: { url: pageUrl } }),
  };
}

/** Wrap events in the v1.3 request body. Pure. */
export function buildTikTokRequestBody(
  data: TikTokEvent[],
  opts: { pixelId: string; testEventCode?: string },
): TikTokRequestBody {
  return {
    event_source: "web",
    event_source_id: opts.pixelId,
    ...(opts.testEventCode && { test_event_code: opts.testEventCode }),
    data,
  };
}

/**
 * Test event code for TikTok Events Manager → Test Events. Non-prod refuses to
 * send without it (same guard as Meta) so we never pollute production reporting.
 */
export function getTikTokTestEventCode(): string | undefined {
  if (isProductionPixelEnv()) {
    if (process.env.TIKTOK_USE_TEST_EVENTS === "true") {
      return process.env.TIKTOK_TEST_EVENT_CODE;
    }
    return undefined;
  }
  return process.env.TIKTOK_TEST_EVENT_CODE || undefined;
}

/**
 * Send one event to the TikTok Events API. Never throws.
 * Returns true ONLY on HTTP 200 with body `code === 0`.
 */
export async function sendTikTokEvent(event: TikTokEvent): Promise<boolean> {
  const pixelId = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN;
  if (!pixelId || !accessToken) return false;

  const testEventCode = getTikTokTestEventCode();
  if (!isProductionPixelEnv() && !testEventCode) {
    console.error("REFUSING TikTok CAPI - non-prod without test_event_code", {
      event: event.event,
      env: getPixelEnv(),
    });
    return false;
  }

  const id = typeof event.event_id === "string" ? event.event_id.trim() : "";
  if (!id) {
    console.error("REFUSING TikTok CAPI - missing event_id", { env: getPixelEnv() });
    return false;
  }

  const body = buildTikTokRequestBody([event], { pixelId, testEventCode });

  try {
    // resilientFetch (NOT raw fetch): routes through the keep-alive-bounded dispatcher
    // and retries the dead-socket race that a frozen Vercel function hits on thaw —
    // the `UND_ERR_SOCKET` incident documented in src/lib/http/outbound.ts. Retry is
    // safe here for the same reason it is for Meta CAPI: TikTok dedups on `event_id`
    // (panel F-025). Matches src/lib/facebook.ts's transport exactly.
    const res = await resilientFetch(
      TIKTOK_EVENTS_API_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Access-Token": accessToken,
        },
        body: JSON.stringify(body),
      },
      { label: "TikTok Events API", timeoutMs: 5_000, retries: 2 },
    );

    const json = (await res.json().catch(() => null)) as
      | { code?: number; message?: string; request_id?: string }
      | null;

    if (!res.ok || !json || json.code !== 0) {
      console.error("[TikTok CAPI] Failed", {
        http: res.status,
        code: json?.code,
        message: json?.message,
        request_id: json?.request_id,
        event: event.event,
        event_id: event.event_id,
      });
      return false;
    }
    return true;
  } catch (err) {
    // describeFetchError surfaces undici's `cause.code` — without it every transport
    // failure logs as an opaque "fetch failed" and the next incident is undiagnosable.
    const { message, code, causeMessage } = describeFetchError(err);
    console.error("[TikTok CAPI] Network error", {
      event: event.event,
      event_id: event.event_id,
      err: message,
      code,
      causeMessage,
    });
    return false;
  }
}
